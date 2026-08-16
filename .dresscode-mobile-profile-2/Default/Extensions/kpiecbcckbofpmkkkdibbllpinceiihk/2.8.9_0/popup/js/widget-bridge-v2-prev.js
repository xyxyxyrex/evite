/**
 * Bridge API
 *
 * Production-ready bridge between the React UI (Next.js) and the browser extension.
 * - In extension context (chrome.runtime.id present) it uses real extension logic
 *   modelled after the legacy original.controller.js.
 * - In non-extension / dev context it falls back to a lightweight in-memory mock.
 *
 * The public API is exposed as `window.BridgeAPI` in the browser and as
 * `module.exports` in CommonJS environments.
 *
 * QUOTA MODEL (v2):
 *   The bridge now owns an "active-time pool" quota engine (createQuotaEngine).
 *   Free users get a single daily pool of *active* proxied time. Time only
 *   decrements while a proxied tab is visible (best-effort metering). When the
 *   pool is exhausted the proxy is paused and the widget shows a disconnect
 *   reason modal until the pool resets, the user upgrades, or tops up.
 *
 *   IMPORTANT: This client-side countdown is a faithful DISPLAY of quota state
 *   and a beta enforcement at best. Real enforcement must be server-side
 *   (the proxy must stop forwarding traffic when the budget is exhausted).
 *   Client storage is a cache, not a vault.
 */

import settings from '../../js/settings.js';
import locations from '../../js/locations.js';
import common from '../../js/common.js';
import domains from '../../js/domains.js';
//import { parse } from 'tldts';
import EventEmitter from 'events';

(async function () {
  'use strict';

  // Detect if we are running inside a browser extension context
  const hasChromeRuntime =
	typeof chrome !== 'undefined' &&
	!!chrome.runtime &&
	typeof chrome.runtime.id === 'string';

  /**
   * Static location catalogue used both for dev mocks and as a fallback
   * when the extension has no bandwidth statistics stored yet.
   */
  const STATIC_LOCATIONS = {
	us: { countryCode: 'us', country: 'United States', city: 'New York', free: true, rtt: 25, continent: 'na' },
	uk: { countryCode: 'uk', country: 'United Kingdom', city: 'London', free: false, rtt: 45, continent: 'eu' },
	de: { countryCode: 'de', country: 'Germany', city: 'Frankfurt', free: false, rtt: 35, continent: 'eu' },
	ca: { countryCode: 'ca', country: 'Canada', city: 'Toronto', free: false, rtt: 30, continent: 'na' },
	fr: { countryCode: 'fr', country: 'France', city: 'Paris', free: false, rtt: 40, continent: 'eu' },
	nl: { countryCode: 'nl', country: 'Netherlands', city: 'Amsterdam', free: false, rtt: 38, continent: 'eu' },
	jp: { countryCode: 'jp', country: 'Japan', city: 'Tokyo', free: false, rtt: 120, continent: 'as' },
	au: { countryCode: 'au', country: 'Australia', city: 'Sydney', free: false, rtt: 180, continent: 'oc' },
  };

  /**
   * Remote-config defaults for the quota engine. Every number here is intended
   * to be overridden by server-driven remote config so monetization can be
   * tuned without shipping code.
   */
  const DEFAULT_QUOTA_CONFIG = {
	model: 'active-time-pool',
	dailyPoolSec: 60 * 60,            // 60 min of active proxied time
	resetMode: 'rolling24h',          // anchored to first consumption of the day
	resetWindowMs: 24 * 60 * 60 * 1000,
	disconnectOnDepleted: true,
	warnDailySec: [300, 60],          // amber at 5:00, red at 1:00
	streamingGraceSec: 120,
	freeConcurrentSites: 1,           // concurrency lever: free = 1 proxied site
	rewardedAd: {
	  enabled: true,
	  depletedTopUpSec: 15 * 60,      // +15 min per rewarded ad
	  maxRedeemsPerDay: 3,
	},
	tickIntervalMs: 1000,
	persistEverySec: 10,
  };

  /**
   * Active-time-pool quota engine shared by both bridge implementations.
   *
   * @param {{ get(k:string):Promise<any>, set(k:string,v:any):Promise<void> }} storage
   * @param {{ emit?: (name:string, payload:any)=>void, onDepleted?: (state:any)=>Promise<void> }} [options]
   */
  function createQuotaEngine(storage, options) {
	options = options || {};
	const config = Object.assign({}, DEFAULT_QUOTA_CONFIG, options.config || {});
	const emit = typeof options.emit === 'function' ? options.emit : function () {};
	const onDepleted = typeof options.onDepleted === 'function' ? options.onDepleted : async function () {};

	let state = null;
	let metering = false;
	let tickIntervalId = null;
	let secondsSincePersist = 0;
	let rewardRedeemsToday = 0;

	function snapshot() {
	  return {
		mode: state.mode,
		dailyRemainingSec: state.dailyRemainingSec,
		dailyPoolSec: config.dailyPoolSec,
		resetsAt: state.resetsAt,
		metering: metering,
		isPremium: state.isPremium,
		freeConcurrentSites: config.freeConcurrentSites,
		reason: state.reason,
		serverNowMs: Date.now(),
	  };
	}

	async function persist() {
	  secondsSincePersist = 0;
	  await storage.set('quotaDailyRemainingSec', state.dailyRemainingSec);
	  await storage.set('quotaResetsAt', state.resetsAt);
	  await storage.set('quotaRewardRedeems', rewardRedeemsToday);
	}

	async function maybeReset() {
	  if (!state || state.isPremium) return false;
	  if (typeof state.resetsAt === 'number' && Date.now() >= state.resetsAt) {
		state.dailyRemainingSec = config.dailyPoolSec;
		state.resetsAt = null;
		rewardRedeemsToday = 0;
		state.reason = null;
		if (state.mode === 'depleted') state.mode = 'ready';
		await persist();
		emit('quotaReset', snapshot());
		emit('quotaStateChange', snapshot());
		return true;
	  }
	  return false;
	}

	async function load() {
	  const isPremium = !!(await storage.get('premium'));
	  let remaining = await storage.get('quotaDailyRemainingSec');
	  let resetsAt = await storage.get('quotaResetsAt');
	  const redeems = await storage.get('quotaRewardRedeems');

	  rewardRedeemsToday = typeof redeems === 'number' ? redeems : 0;
	  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) remaining = config.dailyPoolSec;
	  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) resetsAt = null;

	  remaining = Math.max(0, Math.min(config.dailyPoolSec, remaining));

	  state = {
		mode: isPremium ? 'unlimited' : (remaining > 0 ? 'ready' : 'depleted'),
		dailyRemainingSec: remaining,
		resetsAt: resetsAt,
		isPremium: isPremium,
		reason: (!isPremium && remaining <= 0) ? 'depleted' : null,
	  };

	  await maybeReset();
	}

	function getState() {
	  if (!state) {
		return {
		  mode: 'ready',
		  dailyRemainingSec: config.dailyPoolSec,
		  dailyPoolSec: config.dailyPoolSec,
		  resetsAt: null,
		  metering: false,
		  isPremium: false,
		  freeConcurrentSites: config.freeConcurrentSites,
		  reason: null,
		  serverNowMs: Date.now(),
		};
	  }
	  return snapshot();
	}

	async function startSession() {
	  if (!state) await load();
	  await maybeReset();

	  if (state.isPremium) {
		state.mode = 'unlimited';
		return snapshot();
	  }
	  if (state.dailyRemainingSec <= 0) {
		state.mode = 'depleted';
		state.reason = 'depleted';
		emit('quotaStateChange', snapshot());
		return snapshot();
	  }

	  if (state.resetsAt == null) state.resetsAt = Date.now() + config.resetWindowMs;
	  state.mode = 'active';
	  state.reason = null;
	  await persist();
	  emit('quotaStateChange', snapshot());
	  return snapshot();
	}

	function setMetering(active) {
	  if (!state) {
		metering = false;
		return;
	  }
	  metering = !!active && state.mode === 'active' && !state.isPremium;
	}

	async function depleteNow() {
	  state.mode = 'depleted';
	  state.reason = 'depleted';
	  metering = false;
	  await persist();
	  emit('quotaStateChange', snapshot());
	  emit('dailyDepleted', { resetsAt: state.resetsAt });
	  try {
		await onDepleted(snapshot());
	  } catch (e) {
		console.error('[BridgeAPI] onDepleted handler error:', e);
	  }
	}

	async function tick() {
	  if (!state || state.isPremium) return;
	  await maybeReset();

	  if (metering && state.mode === 'active') {
		state.dailyRemainingSec = Math.max(0, state.dailyRemainingSec - 1);
		if (state.resetsAt == null) state.resetsAt = Date.now() + config.resetWindowMs;

		secondsSincePersist += 1;
		if (secondsSincePersist >= config.persistEverySec) {
		  await persist();
		}

		if (state.dailyRemainingSec <= 0) {
		  await depleteNow();
		  return;
		}
	  }

	  emit('quotaTick', {
		mode: state.mode,
		dailyRemainingSec: state.dailyRemainingSec,
		dailyPoolSec: config.dailyPoolSec,
		resetsAt: state.resetsAt,
		metering: metering,
	  });
	}

	async function redeemReward(kind) {
	  if (!state) await load();
	  await maybeReset();

	  if (!config.rewardedAd.enabled) return snapshot();
	  if (rewardRedeemsToday >= config.rewardedAd.maxRedeemsPerDay) return snapshot();

	  if (kind === 'depletedTopUp') {
		rewardRedeemsToday += 1;
		state.dailyRemainingSec = Math.min(
		  config.dailyPoolSec,
		  state.dailyRemainingSec + config.rewardedAd.depletedTopUpSec
		);
		state.reason = null;
		state.mode = state.isPremium ? 'unlimited' : 'ready';
		if (state.resetsAt == null) state.resetsAt = Date.now() + config.resetWindowMs;
		await persist();
		emit('quotaStateChange', snapshot());
	  }

	  return snapshot();
	}

	function start() {
	  stop();
	  tickIntervalId = setInterval(function () {
		tick().catch(function () {});
	  }, config.tickIntervalMs);
	}

	function stop() {
	  if (tickIntervalId) {
		clearInterval(tickIntervalId);
		tickIntervalId = null;
	  }
	}

	async function init() {
	  await load();
	  start();
	  return snapshot();
	}

	return {
	  init,
	  start,
	  stop,
	  tick,
	  getState,
	  startSession,
	  redeemReward,
	  setMetering,
	  getConfig: function () {
		return Object.assign({}, config);
	  },
	};
  }

  /**
   * Small helper to create a deferred promise – used for window.LOCATIONS_READY.
   */
  function createDeferred() {
	let resolveFn;
	let rejectFn;
	const promise = new Promise((resolve, reject) => {
	  resolveFn = resolve;
	  rejectFn = reject;
	});
	return { promise, resolve: resolveFn, reject: rejectFn };
  }

  /**
   * Utility: get current UNIX timestamp in seconds.
   */
  function getUnixtime() {
	return Math.floor(Date.now() / 1000);
  }

  /**
   * Utility: format seconds into { hh, mm, ss } with optional leading zeros.
   */
  function formatTime(totalSeconds, leadingZero) {
	if (typeof leadingZero === 'undefined') {
	  leadingZero = true;
	}

	const date = new Date(totalSeconds * 1000);
	const days = Math.floor((date - new Date(0)) / (1000 * 60 * 60 * 24));

	let hh = date.getUTCHours() + days * 24;
	let mm = date.getUTCMinutes();
	let ss = date.getSeconds();

	if (leadingZero) {
	  if (hh >= 0 && hh < 10) hh = '0' + hh;
	  if (mm >= 0 && mm < 10) mm = '0' + mm;
	  if (ss >= 0 && ss < 10) ss = '0' + ss;
	}

	return { hh: hh, mm: mm, ss: ss };
  }

	async function wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

  /**
   * Utility: best-effort navigator detection (chrome / opera / firefox).
   */
  function detectNavigatorSlug() {
	if (typeof navigator === 'undefined' || !navigator.userAgent) {
	  return 'crm';
	}

	const ua = navigator.userAgent;

	if (ua.includes('OPR') || ua.includes('Opera')) return 'opr';
	if (ua.includes('Firefox')) return 'ffx';
	return 'crm';
  }

  /**
   * Production bridge implementation (extension context).
   */
  async function createExtensionBridge() {
	console.log('[BridgeAPI] Using EXTENSION bridge implementation');

	/**
	 * Lightweight async wrapper around the extension settings store.
	 */
	const storage = (function createExtensionStorage() {
	  if (!chrome.storage || !chrome.storage.local) {
		console.warn('[BridgeAPI] chrome.storage.local not available, falling back to in-memory storage');
		const memoryStore = {};
		return {
		  async get(key) {
			return memoryStore[key];
		  },
		  async set(key, value) {
			memoryStore[key] = value;
		  },
		};
	  }

	  return {
		async get(key) {
			return await settings.get(key);
		},
		async set(key, value) {
			await settings.set(key, value);
		},
	  };
	})();

	/**
	 * Event listeners. New quota events are broadcast here so the widget can
	 * keep its countdown and paused modal in sync with proxy state.
	 */
	const listeners = {
		connectionDurationChange: new Set(),
		proxyControl: new Set(),
		quotaTick: new Set(),
		quotaStateChange: new Set(),
		dailyDepleted: new Set(),
		quotaReset: new Set(),
	};

	function emitEvent(name, params) {
		const set = listeners[name];
		if (!set) return;
		for (const cb of set) {
			try {
				cb(params);
			} catch (e) {
				console.error('[BridgeAPI] listener error for event:', name, e);
			}
		}
	}

	/**
	 * Settings facade – public API consumed by the UI.
	 */
	const settingsApi = (function createSettingsApi() {
		async function getWidgetHideUntil() {
			const v = await storage.get('widgetHideUntil');
			return typeof v === 'number' ? v : null;
		}

		async function setWidgetHideUntil(v) {
			await storage.set('widgetHideUntil', typeof v === 'number' ? v : null);
		}

	  return {
		getWidgetHideUntil,
		setWidgetHideUntil
	  };
	})();

	async function disconnect() {
		quotaEngine.setMetering(false);

		chrome.runtime.sendMessage({
			action: 'perSiteDeleteDomain',
			domain: await common.getCurrentTabDomain()
		});

		top.postMessage(`{"type": "close"}`, "*");
	}

	async function connect(location) {
		var proxyDomains = await settings.get("proxyDomains");
		var domain = await common.getCurrentTabDomain();
		if (!domain) {
			return;
		}

		proxyDomains.set(domain, {
			country: location,
			stat: {
				up: 0,
				down: 0
			}
		});
		await settings.set("proxyDomains", proxyDomains);

		await storage.set('lastConnectTime', common.getUnixtime());

		await chrome.runtime.sendMessage({
			action: 'perSiteAddDomain',
			domain: domain,
			location: location
		});

		// Begin metering the active-time pool for this session.
		await quotaEngine.startSession();
		await updateMetering();

		let queryOptions = { active: true, lastFocusedWindow: true };
		let [tab] = await chrome.tabs.query(queryOptions);
		if (tab) {
			chrome.tabs.reload(tab.id);
		}
	}

	async function sendWidgetFeedback(issue, description) {
		console.log(issue, description);
	}

	async function saveAction(type, payload) {
		common.saveAction(type, payload);
	}

	async function getProxyEnabled() {
		var domain = await common.getCurrentTabDomain();
		if (domain) {
			var proxyDomains = await settings.get("proxyDomains");
			return proxyDomains.has(domain);
		}

		return false;
	}

	async function getCurrentLocation() {
		var proxyDomains = await settings.get("proxyDomains");

		var domain = await common.getCurrentTabDomain();
		if (domain && proxyDomains.has(domain)) {
			return proxyDomains.get(domain).country;
		}
	}

	async function getLocations(continent = null) {
	  let lastLocations = (await storage.get('lastLocations')) || [];
	  const premium = await storage.get('premium');
	  const bwStat = await storage.get('bwStat');
	  const renderedLocations = {};

		// remove countries that does not exist
		for (var key of lastLocations) {
			if (!bwStat.has(key)) {
				lastLocations.splice(lastLocations.indexOf(key), 1);
			}
		}

		for (var key of bwStat.keys()) {
			if (lastLocations.indexOf(key) == -1) {
				lastLocations.push(key);
			}
		}

		for (var key of !continent ? lastLocations : bwStat.keys()) {
			if (!locations[key] || (locations[key].continent != continent && continent)) {
				continue;
			}

			renderedLocations[key] = {
				countryCode: locations[key].countryCode,
				country: locations[key].country,
				city: locations[key].city,
				continent: locations[key].continent,
				free: locations[key].free
			}

			if (bwStat.size) {
				renderedLocations[key].rtt = bwStat.get(key).rtt;
			}
		}

		return renderedLocations;
	}

	async function getCurrentTabDomain() {
		var domain = await common.getCurrentTabDomain();
		if (!domain) {
			return { domain: null, prefCountryCode: null };
		}

		return { domain: domain, prefCountryCode: getPrefCountry(domain) };
	}

	function getPrefCountry(domain) {
		var cn = domains.getCountry(domain);
		if (cn) {
			return cn;
		}

		var d = domain.trim().split(".").reverse();
		if (locations[d[0]]) {
			return d[0];
		}

		return "us";
	}

	async function getConnectionDuration() {
		return formatTime(common.getUnixtime() - (await storage.get("lastConnectTime")));
	}

	async function getAccountDetails() {
		return {
			email: await storage.get("email"),
			premium: !!(await storage.get("premium")),
			regDate: await storage.get("regDate"),
			proxyDomainsCount: await storage.get("proxyDomains")
		}
	}

	async function getLatencyByCountry(country) {
		var bwStat = await settings.get("bwStat");
		return bwStat.get(country).rtt;
	}

	async function openUpgradeTab() {
	  const token = (await storage.get('token')) || '';
	  const url =
		'https://dotvpn.com/?token=' + encodeURIComponent(token) + '&order';

	  try {
		if (chrome.tabs && chrome.tabs.create) {
		  chrome.tabs.create({ url: url });
		} else {
		  if (typeof window !== 'undefined') {
			window.open(url, '_blank');
		  }
		}
	  } catch (error) {
		console.error('[BridgeAPI] openUpgradeTab exception:', error);
	  }
	}

	function openReviewTab() {
	  const navSlug = detectNavigatorSlug();

	  let url;
	  switch (navSlug) {
		case 'opr':
		  url =
			'https://addons.opera.com/en/extensions/details/dotvpn-free-and-secure-vpn-2/';
		  break;
		case 'ffx':
		  url = 'https://addons.mozilla.org/en-US/firefox/addon/dotvpn/';
		  break;
		case 'crm':
		default:
		  url =
			'https://chrome.google.com/webstore/detail/dotvpn-fast-private-vpn/kpiecbcckbofpmkkkdibbllpinceiihk/reviews?hl=en';
		  break;
	  }

	  try {
		if (chrome.tabs && chrome.tabs.create) {
		  chrome.tabs.create({ url: url });
		} else if (typeof window !== 'undefined') {
		  window.open(url, '_blank');
		}
	  } catch (error) {
		console.error('[BridgeAPI] openReviewTab exception:', error);
	  }
	}

	function addEventListener(name, cb) {
		if (typeof cb !== 'function') return;
		switch (name) {
			case 'connectionDurationChange':
			case 'proxyControl':
			case 'quotaTick':
			case 'quotaStateChange':
			case 'dailyDepleted':
			case 'quotaReset':
				listeners[name].add(cb);
				break;
			default:
				break;
		}
	}

	/**
	 * Internal initialisation run on DOMContentLoaded.
	 */
	async function onDomReady() {
		if (await storage.get("firstRun")) {
			storage.set("firstRun", false);
		}
		common.saveAction('open');

		var host = document.querySelector('#dotvpn-widget-host');
		if (host) {
			var rect = host.getBoundingClientRect();
			top.postMessage(JSON.stringify(rect), "*");
		}

		await updateMetering();
	}

	// ---- Quota engine (active-time pool) ----
	const quotaEngine = createQuotaEngine(storage, {
	  emit: emitEvent,
	  onDepleted: async function () {
		// Pause the proxy for the active domain WITHOUT closing the widget,
		// so the disconnect-reason modal can be shown. Real traffic stop must
		// be enforced server-side.
		try {
		  chrome.runtime.sendMessage({
			action: 'perSiteDeleteDomain',
			domain: await common.getCurrentTabDomain(),
		  });
		} catch (e) {
		  console.error('[BridgeAPI] quota depletion disconnect error:', e);
		}
	  },
	});

	async function updateMetering() {
	  try {
		const enabled = await getProxyEnabled();
		const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
		quotaEngine.setMetering(enabled && visible);
	  } catch (e) {
		quotaEngine.setMetering(false);
	  }
	}

	if (typeof document !== 'undefined') {
	  document.addEventListener('visibilitychange', function () {
		updateMetering();
	  });
	}

	await quotaEngine.init();
	await updateMetering();

	// Hook into DOMContentLoaded lifecycle (extension popup / options page).
	if (typeof document !== 'undefined') {
	  if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function handleDomReady() {
		  document.removeEventListener('DOMContentLoaded', handleDomReady);
		  onDomReady().catch((error) =>
			console.error('[BridgeAPI] onDomReady unhandled error:', error)
		  );
		});
	  } else {
		onDomReady().catch((error) =>
		  console.error('[BridgeAPI] onDomReady unhandled error:', error)
		);
	  }
	}

	// Public API for extension context
	return {
	  settings: settingsApi,
	  getCurrentLocation: getCurrentLocation,
	  getLocations: getLocations,
	  getProxyEnabled: getProxyEnabled,
	  getCurrentTabDomain: getCurrentTabDomain,
	  getConnectionDuration: getConnectionDuration,
	  getAccountDetails: getAccountDetails,
	  getLatencyByCountry: getLatencyByCountry,
	  getPrefCountry: getPrefCountry,
	  openUpgradeTab: openUpgradeTab,
	  openReviewTab: openReviewTab,
	  connect: connect,
	  disconnect: disconnect,
	  sendWidgetFeedback: sendWidgetFeedback,
	  addEventListener: addEventListener,
	  saveAction: saveAction,
	  // ---- Quota (active-time pool) ----
	  getQuotaState: function () { return quotaEngine.getState(); },
	  startSession: function () { return quotaEngine.startSession(); },
	  heartbeat: function () { return quotaEngine.getState(); },
	  redeemReward: function (kind) { return quotaEngine.redeemReward(kind); },
	  getQuotaConfig: function () { return quotaEngine.getConfig(); }
	};
  }

  /**
   * Development / non-extension bridge.
   */
  async function createMockBridge() {
	console.log('[BridgeAPI] Using MOCK bridge implementation');

	const memoryStore = {};
	const storage = {
	  async get(key) { return memoryStore[key]; },
	  async set(key, value) { memoryStore[key] = value; },
	};

	const listeners = {
	  connectionDurationChange: new Set(),
	  proxyControl: new Set(),
	  quotaTick: new Set(),
	  quotaStateChange: new Set(),
	  dailyDepleted: new Set(),
	  quotaReset: new Set(),
	};

	function emitEvent(name, params) {
	  const set = listeners[name];
	  if (!set) return;
	  for (const cb of set) {
		try {
		  cb(params);
		} catch (e) {
		  console.error('[BridgeAPI/mock] listener error for event:', name, e);
		}
	  }
	}

	function addEventListener(name, cb) {
	  if (typeof cb === 'function' && listeners[name]) {
		listeners[name].add(cb);
	  }
	}

	const mockSettings = {
	  getWidgetHideUntil: async () => null,
	  setWidgetHideUntil: async (v) => {
		console.log('[BridgeAPI/mock] setWidgetHideUntil:', v);
	  },
	};

	async function getProxyEnabled() {
		return true;
	}

	async function getCurrentLocation() {
		return "us";
	}

	async function getLocations(continent) {
	  console.log('[BridgeAPI/mock] getLocations() called');

	  const rendered = {};

	  Object.keys(STATIC_LOCATIONS).forEach((key) => {
		const meta = STATIC_LOCATIONS[key];
		rendered[key] = {
		  countryCode: meta.countryCode,
		  country: meta.country,
		  city: meta.city,
		  continent: meta.continent,
		  free: !!meta.free,
		  rtt: meta.rtt,
		};
	  });

	  return rendered;
	}

	function getCurrentTabDomain() {
		return { domain: "google.com", prefCountryCode: "us" };
	}

	async function getConnectionDuration() {
		return formatTime(common.getUnixtime() - (await storage.get("lastConnectTime")));
	}

	async function getAccountDetails() {
		return { email: 'demo@dotvpn.com', premium: false, regDate: null, proxyDomainsCount: 0 };
	}

	async function getLatencyByCountry(country) {
		return 25;
	}

	function getPrefCountry() {
		return "us";
	}

	async function openUpgradeTab() {
	  console.log('[BridgeAPI/mock] openUpgradeTab() called');
	}

	function openReviewTab() {
	  console.log('[BridgeAPI/mock] openReviewTab() called');
	}

	async function connect(location) {
	  console.log('[BridgeAPI/mock] connect() called:', location);
	  await quotaEngine.startSession();
	  await updateMetering();
	}

	async function disconnect() {
	  console.log('[BridgeAPI/mock] disconnect() called');
	  quotaEngine.setMetering(false);
	}

	async function sendWidgetFeedback(issue, description) {
	  console.log('[BridgeAPI/mock] sendWidgetFeedback:', issue, description);
	}

	async function saveAction(type, payload) {
	  console.log('[BridgeAPI/mock] saveAction:', type, ', payload:', payload);
	}

	const quotaEngine = createQuotaEngine(storage, {
	  emit: emitEvent,
	  onDepleted: async () => {
		console.log('[BridgeAPI/mock] quota depleted');
	  },
	});

	async function updateMetering() {
	  const enabled = await getProxyEnabled();
	  const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
	  quotaEngine.setMetering(enabled && visible);
	}

	if (typeof document !== 'undefined') {
	  document.addEventListener('visibilitychange', () => { updateMetering(); });
	}

	await quotaEngine.init();

	return {
	  settings: mockSettings,
	  getCurrentLocation: getCurrentLocation,
	  getLocations: getLocations,
	  getProxyEnabled: getProxyEnabled,
	  getCurrentTabDomain: getCurrentTabDomain,
	  getConnectionDuration: getConnectionDuration,
	  getAccountDetails: getAccountDetails,
	  getLatencyByCountry: getLatencyByCountry,
	  getPrefCountry: getPrefCountry,
	  openUpgradeTab: openUpgradeTab,
	  openReviewTab: openReviewTab,
	  connect: connect,
	  disconnect: disconnect,
	  sendWidgetFeedback: sendWidgetFeedback,
	  addEventListener: addEventListener,
	  saveAction: saveAction,
	  // ---- Quota (active-time pool) ----
	  getQuotaState: function () { return quotaEngine.getState(); },
	  startSession: function () { return quotaEngine.startSession(); },
	  heartbeat: function () { return quotaEngine.getState(); },
	  redeemReward: function (kind) { return quotaEngine.redeemReward(kind); },
	  getQuotaConfig: function () { return quotaEngine.getConfig(); }
	};
  }

  // Create the appropriate bridge implementation for the current environment.
  const BridgeAPI = hasChromeRuntime ? await createExtensionBridge() : await createMockBridge();

  /**
	* Automatically load locations on DOM ready and expose them via globals:
	*  - window.LOCATIONS          – object keyed by location id
	*  - window.LOCATIONS_LOADED   – boolean flag
	*  - window.LOCATIONS_READY    – Promise resolved once locations are loaded
	*
	* This keeps compatibility with the original mock bridge behaviour.
   */
  function setupLocationsBootstrap() {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
	  return;
	}

	const deferred = createDeferred();
	window.LOCATIONS_READY = deferred.promise;
	window.LOCATIONS_LOADED = false;

	async function loadLocations() {
	  try {
		if (!BridgeAPI || typeof BridgeAPI.getLocations !== 'function') {
		  console.warn('[BridgeAPI] getLocations() not available on BridgeAPI');
		  window.LOCATIONS = {};
		  window.LOCATIONS_LOADED = true;
		  deferred.resolve();
		  return;
		}

		const locations = await BridgeAPI.getLocations();
		window.LOCATIONS = locations;
		window.LOCATIONS_LOADED = true;
		deferred.resolve();

		if (typeof EventEmitter !== 'undefined' && EventEmitter && typeof EventEmitter.emitLocationsReady === 'function') {
		  EventEmitter.emitLocationsReady({ locations: locations });
		}
	  } catch (error) {
		console.error('[BridgeAPI] Failed to load locations:', error);
		window.LOCATIONS = {};
		window.LOCATIONS_LOADED = false;
		deferred.reject(error);
	  }
	}

	if (document.readyState === 'loading') {
	  document.addEventListener('DOMContentLoaded', function handleLocationsReady() {
		document.removeEventListener('DOMContentLoaded', handleLocationsReady);
		loadLocations();
	  });
	} else {
		loadLocations();
	}
  }

  setupLocationsBootstrap();

  // Export BridgeAPI to window (browser) and module.exports (CommonJS) for tests.
  if (typeof window !== 'undefined') {
	window.BridgeAPI = BridgeAPI;
	console.log('[BridgeAPI] Exported to window.BridgeAPI');
  }

  if (typeof module !== 'undefined' && module.exports) {
	module.exports = BridgeAPI;
  }
})();