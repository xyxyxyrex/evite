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

	if (await settings.get('premium') ||
		(!await settings.get('premium') && await settings.get('uiGroup') == 'control')) {
		await chrome.runtime.sendMessage({
			action: "initProxy",
		});

		window.location.href = '../popup.html';
		chrome.action.setPopup({popup: 'popup.html'});
		return;
	}

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
		checkConnection: new Set(),
		//currentTabDomainChange: new Set(),

		showSigninView: new Set(),
		showSignupView: new Set(),
		showMainView: new Set(),

		showDisconnectedLayout: new Set(),
		showConnectingLayout: new Set(),
		showConnectedLayout: new Set(),
		showDisconnectingLayout: new Set(),

		showCooldownLayout: new Set()
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
	 * Keep track of a conflicting proxy extension (if any).
	 */
	const proxyControlApp = {
	  id: null,
	  name: null,
	};

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

	  async function getHideAppIcon() {
		return boolGetter('hideAppIcon', false)();
	  }

	  async function setHideAppIcon(v) {
		const value = !!v;
		await storage.set('hideAppIcon', value);

		const hide = await getHideAppIcon();
		if (hide) {
		  await common.setTransparentIcon();
		  if (chrome.action && chrome.action.setTitle) {
			chrome.action.setTitle({ title: ' ' });
		  }
		} else {
			var location = await getCurrentLocation();
			if (location) {
				await common.setIcon(location);
			} else {
				await common.setIcon('logo-inactive');
			}
		}
	  }

	  async function getBlockWebRTC() {
		return boolGetter('blockWebRTC', false)();
	  }

	  async function setBlockWebRTC(v) {
		const desired = !!v;
		const current = await getBlockWebRTC();

		if (!current && desired) {
		  // Request permission to control privacy settings.
		  try {
			if (chrome.runtime && chrome.runtime.sendMessage) {
			  chrome.runtime.sendMessage({ action: 'waitForWebRTCPerm' });
			}

			if (chrome.permissions && chrome.permissions.request) {
			  chrome.permissions.request(
				{ permissions: ['privacy'] },
				async (granted) => {
				  if (granted) {
					await storage.set('blockWebRTC', true);

					const enabled = await boolGetter('enabled', false)();
					if (enabled) {
					  await common.disableWebRTC();
					}
				  }
				}
			  );
			} else {
			  // Fallback: set the flag without requesting permissions.
			  await storage.set('blockWebRTC', true);
			}
		  } catch (error) {
			console.error('[BridgeAPI] setBlockWebRTC (enable) exception:', error);
		  }
		} else if (current && !desired) {
		  try {
			await storage.set('blockWebRTC', false);
			await common.enableWebRTC();

			if (chrome.permissions && chrome.permissions.remove) {
			  chrome.permissions.remove({ permissions: ['privacy'] }, () => {
				if (chrome.runtime && chrome.runtime.lastError) {
				  console.error(
					'[BridgeAPI] permissions.remove error:',
					chrome.runtime.lastError.message
				  );
				}
			  });
			}
		  } catch (error) {
			console.error('[BridgeAPI] setBlockWebRTC (disable) exception:', error);
		  }
		}
	  }

		async function getWidgetHideUntil() {
			const v = await storage.get('widgetHideUntil');
			return typeof v === 'number' ? v : null;
		}

		async function setWidgetHideUntil(v) {
			await storage.set('widgetHideUntil', typeof v === 'number' ? v : null);
		}

	  return {
		getBandwidthSaver: boolGetter('bandwidthSaver', false),
		setBandwidthSaver: boolSetter('bandwidthSaver'),

		getAdblock: boolGetter('adblock', false),
		setAdblock: boolSetter('adblock'),

		getTrackingProtection: boolGetter('trackingProtection', false),
		setTrackingProtection: boolSetter('trackingProtection'),

		getBlockAnalytics: boolGetter('blockAnalytics', false),
		setBlockAnalytics: boolSetter('blockAnalytics'),

		getBlockWebRTC,
		setBlockWebRTC,

		getFirewall: boolGetter('firewall', false),
		setFirewall: boolSetter('firewall'),

		getAutoStart: boolGetter('autoStart', false),
		setAutoStart: boolSetter('autoStart'),

		getHideAppIcon,
		setHideAppIcon,

		getWidgetHideUntil,
		setWidgetHideUntil
	  };
	})();

	/**
	 * Disable the conflicting proxy extension, if any.
	 * This is the production implementation of `getProxyControl` from the
	 * legacy controller.
	 */
	async function getProxyControl() {
	  if (!proxyControlApp.id || !chrome.management || !chrome.management.setEnabled) {
		return;
	  }

	  var token = await storage.get("token");

	  return new Promise((resolve) => {
		try {
		  chrome.management.setEnabled(proxyControlApp.id, false, () => {
			if (chrome.runtime && chrome.runtime.lastError) {
			  console.error(
				'[BridgeAPI] getProxyControl error:',
				chrome.runtime.lastError.message
			  );
			}

			if (token == null) {
				showSigninView();
			} else {
				showMainView();
			}

			resolve();
		  });
		} catch (error) {
		  console.error('[BridgeAPI] getProxyControl exception:', error);
		  resolve();
		}
	  });
	}

	/**
	 * Connect and disconnect logic based on legacy original.controller.js.
	 */
	async function disconnect() {
		chrome.runtime.sendMessage({
			action: 'perSiteDeleteDomain',
			domain: await common.getActiveTabDomain()
		});
		emitEvent("showDisconnectingLayout");
		common.saveAction('disconnect');

		await wait(1000);
		emitEvent("showDisconnectedLayout");
	}

	async function connect(location) {
		var proxyDomains = await settings.get("proxyDomains");
		var domain = await common.getActiveTabDomain();
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

		common.saveAction('connect');
		await storage.set('lastConnectTime', common.getUnixtime());
		emitEvent("showConnectingLayout");
		await chrome.runtime.sendMessage({
			action: 'perSiteAddDomain',
			domain: domain,
			location: location
		});

		await wait(1000);
		emitEvent("showConnectedLayout");
		//console.log('reload')

		let queryOptions = { active: true, lastFocusedWindow: true };
		// `tab` will either be a `tabs.Tab` instance or `undefined`.
		let [tab] = await chrome.tabs.query(queryOptions);
		if (tab) {
			chrome.tabs.reload(tab.id);
		}
	}

	async function updateUI() {
		var domain = await common.getActiveTabDomain();
		if (domain) {
			var proxyDomains = await settings.get("proxyDomains");
			var p = proxyDomains.get(domain);
			if (p) {
				emitEvent("showConnectedLayout");
			} else {
				emitEvent("showDisconnectedLayout");
			}
		}
	}

	async function signout() {
		await settings.reset();
		await chrome.runtime.sendMessage({
			action: "disableProxy",
		});

		emitEvent("showSignupView");
		await signup();
		//showSigninView();
		//showMainView();
	}

	/**
	 * Authentication helpers copied from legacy controller.
	 */
	async function signinSendCode(email) {
	  const apiHost = (await storage.get('apiHost')) || '';
	  if (!apiHost) {
		console.error('[BridgeAPI] signinSendCode: apiHost is not configured');
		emitEvent("showSigninView", {
			state: "email-retry",
			email: email
		});
		return;
	  }

	  const response = await fetch(apiHost + '/4/user/signin', {
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
		body: JSON.stringify({ email: email }),
	  });

	  if (!response.ok) {
		emitEvent("showSigninView", {
			state: "email-retry",
			email: email
		});
		return;
	  }

	  var state = null;
	  const data = await response.json();
	  switch (data.code) {
		case 0:
			state = "code";
			break;

		default:
			state = "email-retry";
			break;
	  }

		await storage.set("signinBoxState", state);
		await storage.set("signinBoxStateData", [{
			key: "email",
			value: email
		}]);

		emitEvent("showSigninView", {
			state: state,
			email: email
		});

		return 0;
	}

	async function signinVerifyCode(email, code) {
	  const apiHost = (await storage.get('apiHost')) || '';
	  if (!apiHost) {
		console.error('[BridgeAPI] signinVerifyCode: apiHost is not configured');
		return 500;
	  }

	  const udid = await storage.get('udid');
	  const installId = await storage.get('installId');

	  const response = await fetch(apiHost + '/4/user/signin', {
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
		body: JSON.stringify({
		  email: email,
		  otp: code,
		  udid: udid,
		  installId: installId,
		}),
	  });

	  if (!response.ok) {
		return 500;
	  }

	  var state = null;
	  const data = await response.json();
	  switch (data.code) {
		case 0:
			await storage.set("email", email);
			await storage.set("token", data.token);

			await storage.set("signinBoxState", null);
			await storage.set("signinBoxStateData", []);

			if (!(await storage.get("udid"))) {
				await storage.set("udid", data.udid);
			}

			await storage.set("premium", data.userInfo.premium);
			common.saveAction("signin");

			if (await settings.get('premium')) {
				await chrome.runtime.sendMessage({
					action: "initProxy",
				});

				window.location.href = '../popup.html';
				chrome.action.setPopup({popup: 'popup.html'});
				return;
			}

			emitEvent("showMainView");
			break;

		default:
			return data.code;
			break;
	  }

		await storage.set("signinBoxState", state);
		await storage.set("signinBoxStateData", [{
			key: "email",
			value: email
		}]);

		emitEvent("showSigninView", {
			state: state,
			email: email
		});
		return data.code;
	}

	async function signup() {//await wait(1000);
		const apiHost = (await storage.get('apiHost')) || '';
		if (!apiHost) {
			console.error('[BridgeAPI] signinVerifyCode: apiHost is not configured');
			return 500;
		}

		const response = await fetch(apiHost + '/4/user/init', {
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: JSON.stringify({
				installId: await storage.get("installId"),
			}),
		});

		if (!response.ok) {
		  // sendFailMetric
		  chrome.tabs.create({
			url: "https://account.dotvpn.com/v2/en/signup",
		  });
		  return;
		}

		var data = await response.json();
		if (data.code != 0) {
		  chrome.tabs.create({
			url: "https://account.dotvpn.com/v2/en/signup",
		  });
		  return;
		}

		await storage.set("token", data.token);

		await storage.set("signinBoxState", null);
		await storage.set("signinBoxStateData", []);

		if (!(await storage.get("udid"))) {
			await storage.set("udid", data.udid);
		}

		await storage.set("premium", data.userInfo.premium);
		await storage.set("uiGroup", data.userInfo.uiGroup);

		await common.updateUserInfo();

		if (await settings.get('uiGroup') == 'control') {
			await chrome.runtime.sendMessage({
				action: "initProxy",
			});

			window.location.href = '../popup.html';
			chrome.action.setPopup({popup: 'popup.html'});
			return;
		}

		await chrome.runtime.sendMessage({
			action: "initProxy",
		});

		emitEvent("showMainView");
	}

	/**
	 * Send feedback to backend API using the same endpoint as legacy controller.
	 */
	async function sendFeedback(email, text, subject) {
	  const apiHost = (await storage.get('apiHost')) || '';
	  if (!apiHost) {
		console.error('[BridgeAPI] sendFeedback: apiHost is not configured');
		return 500;
	  }

	  const token = await storage.get('token');

	  const response = await fetch(apiHost + '/3/user/app-feedback', {
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
		body: JSON.stringify({
		  token: token,
		  subject: subject,
		  text: text,
		}),
	  });

	  if (!response.ok) {
		return 500;
	  }

	  const data = await response.json();
	  return data.code;
	}

	async function sendWidgetFeedback(issue, description) {

	}

	async function showSigninView() {
		// email
		// email-retry
		// code
		// code-retry

		var state = await storage.get("signinBoxState");
		if (!state) {
			state = "email";
		}

		var email = null;
		var data = await storage.get("signinBoxStateData");
		data.forEach(function(item) {
			if (Object.keys(item).includes('key') && item.key == 'email') {
				email = item.value;
			}
		});

		emitEvent("showSigninView", {
			state: state,
			email: email
		});
	}

	async function showMainView() {
		emitEvent("showMainView");

		chrome.runtime.sendMessage({
			action: "stopWaitForWebRTCPerm",
		});

		updateUI();
		//emitEvent("showMainView");

		common.updateUserInfo(async function () {
			updateUI();
			//updateNetworkInfo();
		});
	}

	async function getProxyEnabled() {
		var domain = await common.getActiveTabDomain();
		if (domain) {
			var proxyDomains = await settings.get("proxyDomains");
			return proxyDomains.has(domain);
		}

		return false;
	}

	async function getDomainCooldownStatus(domain) {
		var quotaSites = await settings.get("quotaSites");
		quotaSites = new Map(Object.entries(quotaSites));
		if (quotaSites.has(domain)) {
			const info = quotaSites.get(domain);

			// Check if cooldown exists and is still in the future
			if (info.cooldownUntil && info.cooldownUntil > Date.now()) {
			    return {
					isCooldown: true,
					remaining: info.cooldownUntil - Date.now()
				}
			}
		}

		return {
			isCooldown: false,
			remaining: 0
		}
	}

	async function getCurrentLocation() {
		var proxyDomains = await settings.get("proxyDomains");

		var domain = await common.getActiveTabDomain();
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

	/**
	 * Application version from extension manifest.
	 */
	function getAppVersion() {
	  try {
		if (chrome.runtime && chrome.runtime.getManifest) {
		  const manifest = chrome.runtime.getManifest();
		  return manifest && manifest.version ? manifest.version : '0.0.0';
		}
	  } catch (error) {
		console.error('[BridgeAPI] getAppVersion exception:', error);
	  }
	  return '0.0.0';
	}

	async function getCurrentTabDomain() {
		var domain = await common.getActiveTabDomain();
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

	async function getSigninStateData() {
		var state = await storage.get("signinBoxState");
		var stateData = await storage.get("signinBoxStateData");

		var email = null;
		for (const item of stateData) {
			if (item.key == "email") {
				email = item.value;
				break;
			}
		}

		return { state: state, email: email }
	}

	async function resetSigninStateData() {
		await storage.set("signinBoxState", null);
		await storage.set("signinBoxStateData", []);
	}

	async function getAccountDetails() {
		return {
			email: await storage.get("email"),
			premium: !!(await storage.get("premium")),
			regDate: await storage.get("regDate"),
			proxyDomainsCount: await storage.get("proxyDomains")
		}
	}

	async function getStatsByDomain(domain) {
		var proxyDomains = await storage.get("proxyDomains");
		if (proxyDomains.has(domain)) {
			return proxyDomains.get(domain).stat;
		} else {
			return null;
		}
	}

	async function getLatencyByCountry(country) {
		var bwStat = await settings.get("bwStat");
		return bwStat.get(country).rtt;
	}

	async function activateProxyForDomain(domain, location) {
		//var location = getPrefCountry(domain);
		var proxyDomains = await settings.get("proxyDomains");
		proxyDomains.set(domain, {
			country: location,
			stat: {
				up: 0,
				down: 0
			}
		});
		await settings.set("proxyDomains", proxyDomains);

		common.saveAction("connect", "act");
		await storage.set('lastConnectTime', common.getUnixtime());
		emitEvent("showConnectingLayout");
		await chrome.runtime.sendMessage({
			action: 'perSiteAddDomain',
			domain: domain,
			location: location
		});

		await wait(1000);
		emitEvent("showConnectedLayout");
		//console.log('reload')

		chrome.tabs.update({url: `https://${domain}/`});
	}

	async function getAppTrafficStat() {
		return await storage.get("stat");
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
			case 'proxyControl':
			case 'checkConnection':
			//case 'currentTabDomainChange':

			case 'showSigninView':
			case 'showSignupView':
			case 'showMainView':

			case 'showDisconnectedLayout':
			case 'showConnectingLayout':
			case 'showConnectedLayout':
			case 'showDisconnectingLayout':

			case 'showCooldownLayout':
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




		var perSiteHosts = await settings.get('perSiteProxyHosts');
		//console.log(perSiteHosts);


		chrome.runtime.sendMessage({
			action: "stopWaitForWebRTCPerm",
		});

		// Start connection duration timer.
		window.setInterval(async function () {
			emitEvent("connectionDurationChange", (
				formatTime(common.getUnixtime() - (await storage.get("lastConnectTime")))
			));
		}, 1000);

		var proxyControl = true;
		var e = await chrome.management.getAll();
		e.forEach(function (ext) {
			if (ext.id == chrome.runtime.id || ext.enabled == false) {
				return;
			}

			if (ext.permissions.indexOf('proxy') !== -1) {
				proxyControl = false;
				proxyControlApp.name = ext.shortName || ext.name;
				proxyControlApp.id = ext.id;
			}
		});

		var token = await storage.get("token");
		if (!proxyControl) {
			emitEvent("proxyControl", proxyControlApp);
		}

		if (!token) {
			emitEvent("showSignupView");
			await signup();
			return;
		}

		var state = await storage.get("signinBoxState");
		if (state != null) {
			showSigninView();
		} else {
			showMainView();
			//showSigninView();
		}
		//emitEvent("checkConnection");
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
	  getDomainCooldownStatus: getDomainCooldownStatus,
	  getAppVersion: getAppVersion,
	  getCurrentTabDomain: getCurrentTabDomain,
	  getConnectionDuration: getConnectionDuration,
	  getAccountDetails: getAccountDetails,
	  getSigninStateData: getSigninStateData,
	  getAppTrafficStat: getAppTrafficStat,
	  getStatsByDomain: getStatsByDomain,
	  getLatencyByCountry: getLatencyByCountry,
	  getPrefCountry: getPrefCountry,
	  activateProxyForDomain: activateProxyForDomain,
	  resetSigninStateData: resetSigninStateData,
	  openUpgradeTab: openUpgradeTab,
	  openReviewTab: openReviewTab,
	  connect: connect,
	  disconnect: disconnect,
	  sendFeedback: sendFeedback,
	  sendWidgetFeedback: sendWidgetFeedback,
	  signinSendCode: signinSendCode,
	  signinVerifyCode: signinVerifyCode,
	  signout: signout,
	  getProxyControl: getProxyControl,
	  addEventListener: addEventListener,
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
	  getBandwidthSaver: async () => true,
	  setBandwidthSaver: async (v) => {
		console.log('[BridgeAPI/mock] setBandwidthSaver:', v);
	  },
	  getAdblock: async () => true,
	  setAdblock: async (v) => {
		console.log('[BridgeAPI/mock] setAdblock:', v);
	  },
	  getTrackingProtection: async () => true,
	  setTrackingProtection: async (v) => {
		console.log('[BridgeAPI/mock] setTrackingProtection:', v);
	  },
	  getBlockAnalytics: async () => true,
	  setBlockAnalytics: async (v) => {
		console.log('[BridgeAPI/mock] setBlockAnalytics:', v);
	  },
	  getBlockWebRTC: async () => true,
	  setBlockWebRTC: async (v) => {
		console.log('[BridgeAPI/mock] setBlockWebRTC:', v);
	  },
	  getFirewall: async () => true,
	  setFirewall: async (v) => {
		console.log('[BridgeAPI/mock] setFirewall:', v);
	  },
	  getAutoStart: async () => true,
	  setAutoStart: async (v) => {
		console.log('[BridgeAPI/mock] setAutoStart:', v);
	  },
	  getHideAppIcon: async () => true,
	  setHideAppIcon: async (v) => {
		console.log('[BridgeAPI/mock] setHideAppIcon:', v);
	  },
	  getWidgetHideUntil: async () => true,
	  setWidgetHideUntil: async (v) => {
		console.log('[BridgeAPI/mock] setWidgetHideUntil:', v);
	  },
	};

	async function getProxyEnabled() {
		return true;
	}

	async function getDomainCooldownStatus(domain) {
		return {
			isCooldown: false,
			remaining: 0
		};
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

	function getAppVersion() {
	  console.log('[BridgeAPI/mock] getAppVersion() called');
	  return '1.23.0-mock';
	}

	function getCurrentTabDomain() {
		return { domain: "google.com", prefCountryCode: "us" };
	}

	async function getConnectionDuration() {
		return formatTime(common.getUnixtime() - (await storage.get("lastConnectTime")));
	}

	async function getSigninStateData() {
		return { state: "email", email: "no@email.com" }
	}

	async function getAccountDetails() {
		return {
			email: "no@email.com",
			premium: false,
			regDate: "1970-01-01 00:00:00",
			proxyDomainsCount: 10
		}
	}

	async function getStatsByDomain(domain) {
		return {
			up: 0,
			down: 0
		}
	}

	async function getLatencyByCountry(country) {
		return 25;
	}

	async function activateProxyForDomain(domain, location) {

	}

	async function getAppTrafficStat() {
		return {
			up: 0,
			down: 0
		}
	}

	async function resetSigninStateData() {
		return 0;
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

	async function sendFeedback(email, text, subject) {
	  console.log('[BridgeAPI/mock] sendFeedback() called', {
		email,
		subject,
		text,
	  });
	  return 0;
	}

	async function sendWidgetFeedback(issue, description) {

	}

	async function signout() {
		return 0;
	}

	async function signinSendCode(email) {
	  console.log('[BridgeAPI/mock] signinSendCode() called:', email);
	  return 0;
	}

	async function signinVerifyCode(email, code) {
	  console.log('[BridgeAPI/mock] signinVerifyCode() called:', email, code);
	  return 0;
	}

	async function getProxyControl() {
	  console.log('[BridgeAPI/mock] getProxyControl() called');
	}

	function addEventListener(name, callback) {
	  console.log('[BridgeAPI/mock] addEventListener() called:', name, callback);
	}

	return {
	  settings: mockSettings,
	  getCurrentLocation: getCurrentLocation,
	  getLocations: getLocations,
	  getProxyEnabled: getProxyEnabled,
	  getDomainCooldownStatus: getDomainCooldownStatus,
	  getAppVersion: getAppVersion,
	  getCurrentTabDomain: getCurrentTabDomain,
	  getConnectionDuration: getConnectionDuration,
	  getAccountDetails: getAccountDetails,
	  getSigninStateData: getSigninStateData,
	  getAppTrafficStat: getAppTrafficStat,
	  getStatsByDomain: getStatsByDomain,
	  getLatencyByCountry: getLatencyByCountry,
	  getPrefCountry: getPrefCountry,
	  activateProxyForDomain: activateProxyForDomain,
	  resetSigninStateData: resetSigninStateData,
	  openUpgradeTab: openUpgradeTab,
	  openReviewTab: openReviewTab,
	  connect: connect,
	  disconnect: disconnect,
	  sendFeedback: sendFeedback,
	  sendWidgetFeedback: sendWidgetFeedback,
	  signinSendCode: signinSendCode,
	  signinVerifyCode: signinVerifyCode,
	  signout: signout,
	  getProxyControl: getProxyControl,
	  addEventListener: addEventListener
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