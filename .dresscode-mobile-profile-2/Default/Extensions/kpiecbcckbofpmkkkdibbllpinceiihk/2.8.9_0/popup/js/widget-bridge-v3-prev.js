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
 * QUOTA MODEL (v3 — site-based sessions):
 *   The bridge owns a "site-session" quota engine (createQuotaEngine). Free
 *   users can connect to an unlimited number of different websites per day, and
 *   each website gets its own fixed free session. The countdown runs only while
 *   the site is connected; disconnecting pauses it. When a site's session is
 *   exhausted (or the user disconnects it) that site enters a 1-hour reconnect
 *   cooldown during which reconnecting is blocked and the widget shows a
 *   cooldown modal. Once per day a single site may claim a bonus session
 *   extension instead of waiting.
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
	model: 'site-session',
	sessionSec: 20 * 60,              // free session length per site (20 min)
	bonusSec: 15 * 60,               // one-time daily bonus extension (+15 min)
	bonusPerDay: 1,                  // one site per day may claim the bonus
	cooldownMs: 60 * 60 * 1000,      // 1h reconnect cooldown after a session ends
	disconnectOnDepleted: true,
	warnSessionSec: [300, 60],       // amber at 5:00, red at 1:00
	freeConcurrentSites: 1,          // concurrency lever: free = 1 proxied site
	tickIntervalMs: 1000,
	persistEverySec: 10,
  };

  /**
   * Site-session quota engine shared by both bridge implementations.
   *
   * State is keyed by domain. Each site record holds its own remaining session
   * seconds, an optional cooldown timestamp, and whether it has already claimed
   * the (once-per-day, global) bonus.
   *
   * @param {{ get(k:string):Promise<any>, set(k:string,v:any):Promise<void> }} storage
   * @param {{ emit?: (name:string, payload:any)=>void, onDepleted?: (state:any)=>Promise<void>, config?: object }} [options]
   */
  function createQuotaEngine(storage, options) {
	options = options || {};
	const config = Object.assign({}, DEFAULT_QUOTA_CONFIG, options.config || {});
	const emit = typeof options.emit === 'function' ? options.emit : function () {};
	const onDepleted = typeof options.onDepleted === 'function' ? options.onDepleted : async function () {};

	// domain -> { remainingSec, cooldownUntil, bonusApplied }
	let sites = {};
	let bonusDate = null;       // 'YYYY-M-D' day the once-per-day bonus was consumed
	let isPremium = false;
	let currentDomain = null;
	let metering = false;       // true while the current site's countdown is running
	let loaded = false;
	let tickIntervalId = null;
	let secondsSincePersist = 0;

	function todayKey() {
	  const d = new Date();
	  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
	}

	function bonusAvailable() {
	  return !isPremium && config.bonusPerDay > 0 && bonusDate !== todayKey();
	}

	function clampNumber(n, min, max) {
	  if (typeof n !== 'number' || !Number.isFinite(n)) return min;
	  return Math.max(min, Math.min(max, n));
	}

	function ensureSite(domain) {
	  if (!domain) return null;
	  if (!sites[domain] || typeof sites[domain] !== 'object') {
		sites[domain] = {
		  remainingSec: config.sessionSec,
		  cooldownUntil: null,
		  bonusApplied: false,
		};
	  }
	  return sites[domain];
	}

	function isCoolingDown(rec) {
	  return !!(rec && typeof rec.cooldownUntil === 'number' && Date.now() < rec.cooldownUntil);
	}

	// When a cooldown has elapsed (or a record is stuck in an exhausted state
	// without a cooldown), restore a fresh free session for that site.
	function refreshIfReady(rec) {
	  if (!rec) return;
	  if (typeof rec.cooldownUntil === 'number' && Date.now() >= rec.cooldownUntil) {
		rec.cooldownUntil = null;
		rec.remainingSec = config.sessionSec;
	  } else if (rec.cooldownUntil == null && rec.remainingSec <= 0) {
		rec.remainingSec = config.sessionSec;
	  }
	}

	function modeFor(domain) {
	  if (isPremium) return 'unlimited';
	  const rec = domain ? sites[domain] : null;
	  if (rec && (isCoolingDown(rec) || rec.remainingSec <= 0)) return 'cooldown';
	  if (domain && domain === currentDomain && metering) return 'active';
	  return 'ready';
	}

	function snapshotFor(domain) {
	  const rec = domain ? sites[domain] : null;
	  const mode = modeFor(domain);
	  const coolingDown = isCoolingDown(rec);
	  return {
		model: config.model,
		domain: domain || null,
		mode: mode,
		sessionRemainingSec: rec ? Math.max(0, rec.remainingSec) : config.sessionSec,
		sessionSec: config.sessionSec,
		cooldownUntil: coolingDown ? rec.cooldownUntil : null,
		cooldownMs: config.cooldownMs,
		metering: metering && domain === currentDomain,
		isPremium: isPremium,
		bonusAvailable: bonusAvailable(),
		bonusAppliedToCurrent: !!(rec && rec.bonusApplied),
		bonusSec: config.bonusSec,
		freeConcurrentSites: config.freeConcurrentSites,
		reason: mode === 'cooldown' ? 'cooldown' : null,
		serverNowMs: Date.now(),
	  };
	}

	async function persist() {
	  secondsSincePersist = 0;
	  const out = {};
	  Object.keys(sites).forEach(function (k) {
		const r = sites[k];
		if (!r) return;
		out[k] = {
		  remainingSec: r.remainingSec,
		  cooldownUntil: r.cooldownUntil,
		  bonusApplied: r.bonusApplied,
		};
	  });
	  await storage.set('quotaSites', out);
	  await storage.set('quotaBonusDate', bonusDate);
	}

	async function load() {
	  isPremium = !!(await storage.get('premium'));
	  const storedSites = await storage.get('quotaSites');
	  const storedBonusDate = await storage.get('quotaBonusDate');

	  sites = (storedSites && typeof storedSites === 'object') ? storedSites : {};
	  bonusDate = typeof storedBonusDate === 'string' ? storedBonusDate : null;

	  Object.keys(sites).forEach(function (k) {
		const r = sites[k];
		if (!r || typeof r !== 'object') {
		  delete sites[k];
		  return;
		}
		r.remainingSec = clampNumber(r.remainingSec, 0, config.sessionSec + config.bonusSec);
		if (typeof r.cooldownUntil !== 'number' || !Number.isFinite(r.cooldownUntil)) {
		  r.cooldownUntil = null;
		}
		r.bonusApplied = !!r.bonusApplied;
		refreshIfReady(r);
	  });

	  // If the stored bonus day is not today, the daily bonus is available again
	  // and per-site bonus flags reset so a new site can claim it.
	  if (bonusDate !== todayKey()) {
		bonusDate = null;
		Object.keys(sites).forEach(function (k) {
		  if (sites[k]) sites[k].bonusApplied = false;
		});
	  }

	  loaded = true;
	}

	function getState() {
	  return snapshotFor(currentDomain);
	}

	function setCurrentDomain(domain) {
	  currentDomain = domain || null;
	  if (currentDomain && sites[currentDomain]) {
		refreshIfReady(sites[currentDomain]);
	  }
	}

	async function startSession(domain) {
	  if (!loaded) await load();
	  domain = domain || currentDomain;
	  currentDomain = domain || currentDomain;
	  if (!domain) return snapshotFor(null);

	  if (isPremium) {
		return snapshotFor(domain);
	  }

	  const rec = ensureSite(domain);
	  refreshIfReady(rec);

	  // Block reconnect while the site is cooling down or exhausted.
	  if (isCoolingDown(rec) || rec.remainingSec <= 0) {
		if (!isCoolingDown(rec)) {
		  rec.cooldownUntil = Date.now() + config.cooldownMs;
		}
		metering = false;
		await persist();
		emit('quotaStateChange', snapshotFor(domain));
		return snapshotFor(domain);
	  }

	  metering = true;
	  await persist();
	  emit('quotaStateChange', snapshotFor(domain));
	  return snapshotFor(domain);
	}

	async function endSession(domain) {
	  if (!loaded) await load();
	  domain = domain || currentDomain;
	  metering = false;
	  if (!domain || isPremium) return snapshotFor(domain);

	  const rec = ensureSite(domain);
	  if (!isCoolingDown(rec)) {
		rec.cooldownUntil = Date.now() + config.cooldownMs;
	  }
	  await persist();
	  emit('quotaStateChange', snapshotFor(domain));
	  return snapshotFor(domain);
	}

	function setMetering(connected) {
	  if (isPremium) {
		metering = false;
		return;
	  }
	  const rec = currentDomain ? sites[currentDomain] : null;
	  const blocked = rec && (isCoolingDown(rec) || rec.remainingSec <= 0);
	  metering = !!connected && !blocked;
	}

	async function depleteNow(domain) {
	  const rec = ensureSite(domain);
	  rec.remainingSec = 0;
	  rec.cooldownUntil = Date.now() + config.cooldownMs;
	  metering = false;
	  await persist();
	  emit('quotaStateChange', snapshotFor(domain));
	  emit('sessionDepleted', { domain: domain, cooldownUntil: rec.cooldownUntil });
	  try {
		await onDepleted(snapshotFor(domain));
	  } catch (e) {
		console.error('[BridgeAPI] onDepleted handler error:', e);
	  }
	}

	async function tick() {
	  if (isPremium) return;
	  const domain = currentDomain;
	  const rec = domain ? sites[domain] : null;

	  // Surface cooldown expiry so the widget can resume.
	  if (rec && typeof rec.cooldownUntil === 'number' && Date.now() >= rec.cooldownUntil) {
		refreshIfReady(rec);
		await persist();
		emit('cooldownEnded', { domain: domain });
		emit('quotaStateChange', snapshotFor(domain));
	  }

	  if (metering && rec && rec.remainingSec > 0 && !isCoolingDown(rec)) {
		rec.remainingSec = Math.max(0, rec.remainingSec - 1);
		secondsSincePersist += 1;
		if (secondsSincePersist >= config.persistEverySec) {
		  await persist();
		}
		if (rec.remainingSec <= 0) {
		  await depleteNow(domain);
		  return;
		}
	  }

	  emit('quotaTick', snapshotFor(domain));
	}

	async function applyBonus(domain) {
	  if (!loaded) await load();
	  domain = domain || currentDomain;
	  if (!domain || isPremium) return snapshotFor(domain);
	  if (!bonusAvailable()) return snapshotFor(domain);

	  const rec = ensureSite(domain);
	  if (rec.bonusApplied) return snapshotFor(domain);

	  bonusDate = todayKey();
	  rec.bonusApplied = true;
	  rec.cooldownUntil = null;
	  rec.remainingSec = clampNumber(
		Math.max(0, rec.remainingSec) + config.bonusSec,
		0,
		config.sessionSec + config.bonusSec
	  );
	  metering = false;
	  await persist();
	  emit('quotaStateChange', snapshotFor(domain));
	  emit('bonusApplied', snapshotFor(domain));
	  return snapshotFor(domain);
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
	  return snapshotFor(currentDomain);
	}

	return {
	  init,
	  start,
	  stop,
	  tick,
	  getState,
	  startSession,
	  endSession,
	  applyBonus,
	  setMetering,
	  setCurrentDomain,
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
	 * Event listeners. Quota events are broadcast here so the widget can keep its
	 * per-site countdown and cooldown modal in sync with proxy state.
	 */
	const listeners = {
		connectionDurationChange: new Set(),
		proxyControl: new Set(),
		quotaTick: new Set(),
		quotaStateChange: new Set(),
		sessionDepleted: new Set(),
		cooldownEnded: new Set(),
		bonusApplied: new Set(),
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
		const domain = await common.getCurrentTabDomain();

		quotaEngine.setMetering(false);
		// Disconnecting a site starts its 1-hour reconnect cooldown.
		await quotaEngine.endSession(domain);

		chrome.runtime.sendMessage({
			action: 'perSiteDeleteDomain',
			domain: domain
		});

		top.postMessage(`{\"type\": \"close\"}`, "*");
	}

	async function connect(location) {
		var domain = await common.getCurrentTabDomain();
		if (!domain) {
			return;
		}

		quotaEngine.setCurrentDomain(domain);

		// Block reconnect while this site is in its post-session cooldown.
		const session = await quotaEngine.startSession(domain);
		if (session.mode === 'cooldown') {
			emitEvent('quotaStateChange', session);
			return session;
		}

		var proxyDomains = await settings.get("proxyDomains");
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

		// Begin metering this site's session.
		await updateMetering();

		let queryOptions = { active: true, lastFocusedWindow: true };
		let [tab] = await chrome.tabs.query(queryOptions);
		if (tab) {
			chrome.tabs.reload(tab.id);
		}

		return session;
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
			case 'sessionDepleted':
			case 'cooldownEnded':
			case 'bonusApplied':
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

	// ---- Quota engine (site-session) ----
	const quotaEngine = createQuotaEngine(storage, {
	  emit: emitEvent,
	  onDepleted: async function (snap) {
		// Pause the proxy for the active domain WITHOUT closing the widget, so the
		// cooldown modal can be shown. Real traffic stop must be enforced server-side.
		try {
		  chrome.runtime.sendMessage({
			action: 'perSiteDeleteDomain',
			domain: (snap && snap.domain) ? snap.domain : await common.getCurrentTabDomain(),
		  });
		} catch (e) {
		  console.error('[BridgeAPI] quota depletion disconnect error:', e);
		}
	  },
	});

	async function updateMetering() {
	  try {
		const domain = await common.getCurrentTabDomain();
		if (domain) quotaEngine.setCurrentDomain(domain);
		const enabled = await getProxyEnabled();
		quotaEngine.setMetering(!!enabled);
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
	try {
	  const initialDomain = await common.getCurrentTabDomain();
	  if (initialDomain) quotaEngine.setCurrentDomain(initialDomain);
	} catch (e) {
	  console.error('[BridgeAPI] initial domain resolve error:', e);
	}
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
	  // ---- Quota (site-session) ----
	  getQuotaState: function () { return quotaEngine.getState(); },
	  startSession: async function () { return quotaEngine.startSession(await common.getCurrentTabDomain()); },
	  applyBonus: async function () { return quotaEngine.applyBonus(await common.getCurrentTabDomain()); },
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
	  sessionDepleted: new Set(),
	  cooldownEnded: new Set(),
	  bonusApplied: new Set(),
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
	  quotaEngine.setCurrentDomain('google.com');
	  const session = await quotaEngine.startSession('google.com');
	  if (session.mode === 'cooldown') return session;
	  await updateMetering();
	  return session;
	}

	async function disconnect() {
	  console.log('[BridgeAPI/mock] disconnect() called');
	  quotaEngine.setMetering(false);
	  await quotaEngine.endSession('google.com');
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
		console.log('[BridgeAPI/mock] site session depleted; cooldown started');
	  },
	});

	async function updateMetering() {
	  quotaEngine.setCurrentDomain('google.com');
	  const enabled = await getProxyEnabled();
	  quotaEngine.setMetering(!!enabled);
	}

	if (typeof document !== 'undefined') {
	  document.addEventListener('visibilitychange', () => { updateMetering(); });
	}

	await quotaEngine.init();
	quotaEngine.setCurrentDomain('google.com');
	await updateMetering();

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
	  // ---- Quota (site-session) ----
	  getQuotaState: function () { return quotaEngine.getState(); },
	  startSession: function () { return quotaEngine.startSession('google.com'); },
	  applyBonus: function () { return quotaEngine.applyBonus('google.com'); },
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