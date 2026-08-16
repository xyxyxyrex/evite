/**
 * Bridge API
 *
 * Production-ready bridge between the React UI (Next.js) and the browser extension.
 * - In extension context (chrome.runtime.id present) it uses real extension logic
 *   modelled after the legacy original.controller.js.
 * - In non-extension / dev context it falls back to a lightweight in‑memory mock.
 *
 * The public API is exposed as `window.BridgeAPI` in the browser and as
 * `module.exports` in CommonJS environments.
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
   *
   * NOTE: You can safely extend this list with additional locations.
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
   * Taken from the legacy original.controller.js implementation.
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
   * Utility: best‑effort navigator detection (chrome / opera / firefox).
   * Used to open the correct review page, mirroring legacy `common.getNavigator`.
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
   * Mirrors the behaviour of the legacy original.controller.js wherever possible,
   * but is self‑contained and does not depend on the old modules.
   */
  async function createExtensionBridge() {
	console.log('[BridgeAPI] Using EXTENSION bridge implementation');

	/**
	 * Lightweight async wrapper around chrome.storage.local.
	 * This replaces the legacy settings.js module.
	 */
	const storage = (function createExtensionStorage() {
	  if (!chrome.storage || !chrome.storage.local) {
		console.warn('[BridgeAPI] chrome.storage.local not available, falling back to in‑memory storage');
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
			await settings.set(key ,value);
		},
	  };
	})();

	/**
	 * Event listeners mirroring legacy controller:
	 *  - connectionDuration: (formattedTime: {hh,mm,ss}) => void
	 *  - proxyControl: (proxyExtensionInfo | null) => void
	 *  - checkConnection: () => void  (reserved for future use)
	 */
	const listeners = {
		connectionDurationChange: new Set(),
		proxyControl: new Set(),
		//checkConnection: new Set(),
		//currentTabDomainChange: new Set(),

		//showDisconnectedLayout: new Set(),
		//showConnectingLayout: new Set(),
		//showConnectedLayout: new Set(),
		//showDisconnectingLayout: new Set()
	};

	function emitEvent(name, params) {//console.log(name ,listeners)
		for (const cb of listeners[name]) {
			try {
				cb(params);
			} catch (e) {
				console.error('[BridgeAPI] listener error for event:', name, e);
			}
		}
			//console.log("emit", name, params);
	}

	/**
	 * Settings facade – public API consumed by the UI.
	 * This mirrors the structure and side‑effects of the legacy controller's
	 * `settings` object while using our local storage wrapper.
	 */
	const settingsApi = (function createSettingsApi() {
	  const boolGetter = (key, defaultValue) => {
		return async function getBooleanSetting() {
		  const value = await storage.get(key);
		  if (typeof value === 'boolean') return value;
		  if (typeof value === 'undefined') return !!defaultValue;
		  return !!value;
		};
	  };

	  const boolSetter = (key) => {
		return async function setBooleanSetting(v) {
		  await storage.set(key, !!v);
		};
	  };

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

	/**
	 * Connect and disconnect logic based on legacy original.controller.js.
	 */
	async function disconnect() {
		chrome.runtime.sendMessage({
			action: 'perSiteDeleteDomain',
			domain: await common.getCurrentTabDomain()
		});
		//await common.saveAction('disconnect');

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

		//common.saveAction('connect');
		await storage.set('lastConnectTime', common.getUnixtime());

		await chrome.runtime.sendMessage({
			action: 'perSiteAddDomain',
			domain: domain,
			location: location
		});

		let queryOptions = { active: true, lastFocusedWindow: true };
		// `tab` will either be a `tabs.Tab` instance or `undefined`.
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

		/*if (!lastLocations.length) {
			var location = bwStat.keys().next().value;
			await settings.set("location", location);
		}*/

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

		var i = 0;
		for (var key of !continent ? lastLocations : bwStat.keys()) {
			/*if (key == location && !continent) {
				continue;
			}*/

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

		//var d = parse(tab.domain);
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

	/**
	 * Open upgrade tab as in legacy controller.
	 */
	async function openUpgradeTab() {
	  const token = (await storage.get('token')) || '';
	  const url =
		'https://dotvpn.com/?token=' + encodeURIComponent(token) + '&order';

	  try {
		if (chrome.tabs && chrome.tabs.create) {
		  chrome.tabs.create({ url: url });
		} else {
		  // Fallback for non‑tab contexts.
		  if (typeof window !== 'undefined') {
			window.open(url, '_blank');
		  }
		}
	  } catch (error) {
		console.error('[BridgeAPI] openUpgradeTab exception:', error);
	  }
	}

	/**
	 * Open review page for the current browser (Chrome / Opera / Firefox).
	 */
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
		switch (name) {
			case 'connectionDurationChange':
			//case 'checkConnection':
			//case 'currentTabDomainChange':

			//case 'showDisconnectedLayout':
			//case 'showConnectingLayout':
			//case 'showConnectedLayout':
			//case 'showDisconnectingLayout':
				listeners[name].add(cb);
				break;
		}
	}

	/**
	 * Internal initialisation run on DOMContentLoaded.
	 * Mirrors the legacy controller's startup behaviour.
	 */
	async function onDomReady() {
		if (await storage.get("firstRun")) {
			storage.set("firstRun", false);
		}
		common.saveAction('open');

		var rect = document.querySelector('#dotvpn-widget-host').getBoundingClientRect();
		top.postMessage(JSON.stringify(rect), "*");

		var perSiteHosts = await settings.get('perSiteProxyHosts');
		//console.log(perSiteHosts);


		// Start connection duration timer.
		window.setInterval(async function () {
			emitEvent("connectionDurationChange", (
				formatTime(common.getUnixtime() - (await storage.get("lastConnectTime")))
			));
		}, 1000);
	}

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
	  getLatencyByCountry: getLatencyByCountry,
	  getPrefCountry: getPrefCountry,
	  openUpgradeTab: openUpgradeTab,
	  openReviewTab: openReviewTab,
	  connect: connect,
	  disconnect: disconnect,
	  sendWidgetFeedback: sendWidgetFeedback,
	  addEventListener: addEventListener,
	  saveAction: saveAction
	};
  }

  /**
   * Development / non‑extension bridge.
   * This matches the previous mock implementation but is wrapped so that
   * production code can switch to the real extension bridge automatically.
   */
  function createMockBridge() {
	console.log('[BridgeAPI] Using MOCK bridge implementation');

	const mockSettings = {
	  getWidgetHideUntil: async () => true,
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

	async function getLatencyByCountry(country) {
		return 25;
	}

	async function activateProxyForDomain(domain, location) {

	}

	async function openUpgradeTab() {
	  console.log('[BridgeAPI/mock] openUpgradeTab() called');
	}

	function openReviewTab() {
	  console.log('[BridgeAPI/mock] openReviewTab() called');
	}

	async function connect(location) {
	  console.log('[BridgeAPI/mock] connect() called:', location);
	}

	async function disconnect() {
	  console.log('[BridgeAPI/mock] disconnect() called');
	}

	async function sendWidgetFeedback(issue, description) {

	}

	async function saveAction(type, payload) {

	}

	function addEventListener(name, callback) {
	  console.log('[BridgeAPI/mock] addEventListener() called:', name, callback);
	}

	return {
	  settings: mockSettings,
	  getCurrentLocation: getCurrentLocation,
	  getLocations: getLocations,
	  getProxyEnabled: getProxyEnabled,
	  getCurrentTabDomain: getCurrentTabDomain,
	  getConnectionDuration: getConnectionDuration,
	  getLatencyByCountry: getLatencyByCountry,
	  getPrefCountry: getPrefCountry,
	  openUpgradeTab: openUpgradeTab,
	  openReviewTab: openReviewTab,
	  connect: connect,
	  disconnect: disconnect,
	  sendWidgetFeedback: sendWidgetFeedback,
	  addEventListener: addEventListener,
	  saveAction: saveAction
	};
  }

  // Create the appropriate bridge implementation for the current environment.
  const BridgeAPI = hasChromeRuntime ? await createExtensionBridge() : createMockBridge();

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