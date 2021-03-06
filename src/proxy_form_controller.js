// Copyright (c) 2011 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This file implements the ProxyFormController class, which
 * wraps a form element with logic that enables implementation of proxy
 * settings.
 *
 * @author mkwst@google.com (Mike West)
 * 
 * Modifications by leo.nomdedeu@gmail.com and david.rubert@gmail.com to
 * fit the needs of the guifi.net spanish community
 */

/**
 * Wraps the proxy configuration form, binding proper handlers to its various
 * `change`, `click`, etc. events in order to take appropriate action in
 * response to user events.
 *
 * @param {string} id The form's DOM ID.
 * @constructor
 */
var ProxyFormController = function(id) {
  /**
   * The wrapped form element
   * @type {Node}
   * @private
   */
  this.form_ = document.getElementById(id);

  // Throw an error if the element either doesn't exist, or isn't a form.
  if (!this.form_)
    throw chrome.i18n.getMessage('errorIdNotFound', id);
  else if (this.form_.nodeName !== 'FORM')
    throw chrome.i18n.getMessage('errorIdNotForm', id);

  /**
   * Cached references to the `fieldset` groups that define the configuration
   * options presented to the user.
   *
   * @type {NodeList}
   * @private
   */
  this.configGroups_ = document.querySelectorAll('#' + id + ' > fieldset');

  this.bindEventHandlers_();
  this.fillGuifinetProxies_(this.guifinetProxies);

  this.readCurrentState_();

  // Handle errors
  this.handleProxyErrors_();
};

///////////////////////////////////////////////////////////////////////////////

/**
 * The proxy types we're capable of handling.
 * @enum {string}
 */
ProxyFormController.ProxyTypes = {
  AUTO: 'auto_detect',
  PAC: 'pac_script',
  DIRECT: 'direct',
  FIXED: 'fixed_servers',
  GUIFINET: 'fixed_servers_guifinet',
  SYSTEM: 'system'
};

/**
 * The window types we're capable of handling.
 * @enum {int}
 */
ProxyFormController.WindowTypes = {
  REGULAR: 1,
  INCOGNITO: 2
};

/**
 * The extension's level of control of Chrome's roxy setting
 * @enum {string}
 */
ProxyFormController.LevelOfControl = {
  NOT_CONTROLLABLE: 'not_controllable',
  OTHER_EXTENSION: 'controlled_by_other_extension',
  AVAILABLE: 'controllable_by_this_extension',
  CONTROLLING: 'controlled_by_this_extension'
};

/**
 * The response type from 'proxy.settings.get'
 *
 * @typedef {{value: ProxyConfig,
 *     levelOfControl: ProxyFormController.LevelOfControl}}
 */
ProxyFormController.WrappedProxyConfig;

///////////////////////////////////////////////////////////////////////////////

/**
 * Retrieves proxy settings that have been persisted across restarts.
 *
 * @return {?ProxyConfig} The persisted proxy configuration, or null if no
 *     value has been persisted.
 * @static
 */
ProxyFormController.getPersistedSettings = function() {
  var result = null;
  if (window.localStorage['proxyConfig'] !== undefined)
    result = JSON.parse(window.localStorage['proxyConfig']);
//  console.log("getPersistedSettings> result="+JSON.stringify(result));
  return result ? result : null;
};


/**
 * Persists proxy settings across restarts.
 *
 * @param {!ProxyConfig} config The proxy config to persist.
 * @static
 */
ProxyFormController.setPersistedSettings = function(config) {
//  console.log("setPersistedSettings> config="+JSON.stringify(config));
  window.localStorage['proxyConfig'] = JSON.stringify(config);
};

///////////////////////////////////////////////////////////////////////////////

ProxyFormController.prototype = {
  /**
   * The form's current state.
   * @type {regular: ?ProxyConfig, incognito: ?ProxyConfig}
   * @private
   */
  config_: {regular: null, incognito: null},

  /**
   * Do we have access to incognito mode?
   * @type {boolean}
   * @private
   */
  isAllowedIncognitoAccess_: false,

  /**
   * @return {string} The PAC file URL (or an empty string).
   */
  get pacURL() {
    return document.getElementById('autoconfigURL').value;
  },


  /**
   * @param {!string} value The PAC file URL.
   */
  set pacURL(value) {
    document.getElementById('autoconfigURL').value = value;
  },


  /**
   * @return {string} The PAC file data (or an empty string).
   */
  get manualPac() {
    return document.getElementById('autoconfigData').value;
  },


  /**
   * @param {!string} value The PAC file data.
   */
  set manualPac(value) {
    document.getElementById('autoconfigData').value = value;
  },


  /**
   * @return {Array.<string>} A list of hostnames that should bypass the proxy.
   */
  get bypassList() {
    return document.getElementById('bypassList' + this.guifinetTrailing).value.split(/\s*(?:,|^)\s*/m);
  },


  /**
   * @param {?Array.<string>} data A list of hostnames that should bypass
   *     the proxy. If empty, the bypass list is emptied.
   */
  set bypassList(data) {
    if (!data)
      data = [];
    document.getElementById('bypassList' + this.guifinetTrailing).value = data.join(', ');
  },


  /**
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @return {?ProxyServer} An object containing the proxy server host, port,
   *     and scheme. If null, there is no single proxy.
   */
  get singleProxy() {
    var checkbox = document.getElementById('singleProxyForEverything' + this.guifinetTrailing );
    return checkbox.checked ? this.httpProxy : null;
  },


  /**
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If null, the single proxy checkbox will be unchecked.
   */
  set singleProxy(data) {
    var checkbox = document.getElementById('singleProxyForEverything' + this.guifinetTrailing);
    checkbox.checked = !!data;

    if (data)
      this.httpProxy = data;

    if (checkbox.checked)
      checkbox.parentNode.parentNode.classList.add('single');
    else
      checkbox.parentNode.parentNode.classList.remove('single');
  },

  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get httpProxy() {
    return this.getProxyImpl_('Http');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set httpProxy(data) {
    this.setProxyImpl_('Http', data);
  },


  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get httpsProxy() {
    return this.getProxyImpl_('Https');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set httpsProxy(data) {
    this.setProxyImpl_('Https', data);
  },


  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get ftpProxy() {
    return this.getProxyImpl_('Ftp');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set ftpProxy(data) {
    this.setProxyImpl_('Ftp', data);
  },


  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get fallbackProxy() {
    return this.getProxyImpl_('Fallback');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set fallbackProxy(data) {
    this.setProxyImpl_('Fallback', data);
  },
  
  get guifinet() {
  	return document.getElementById('fixed_servers_guifinet').classList.contains('active');
  },
  
  get guifinetTrailing() {
  	return (this.guifinet?"_guifinet":"");
  },
  
  get guifinetProxies() {
	var proxies = new Array();
	//TODO Obtenerlos y almacenarlos en local con actualización cada ve que sí haya Internet
  	proxies[0] = ["http", "10.228.171.199",3128,"inforgames","En construcci&oacute;n", 4000000, 256000, "unknown", "unknown"];
  	proxies[1] = ["http", "10.228.144.163",3128,"castalia","Operativo", 4000000, 256000, "unknown", "unknown"];
  	proxies[2] = ["http", "10.90.80.4",3128,"crevillente","Operativo", 8000000, 1000000, "unknown", "unknown"];
  	proxies[3] = ["http", "10.228.171.134",3128,"pistacero","En pruebas", 10000000, 1000000, "unknown", "unknown"];

	return proxies;
  },

  /**
   * @param {string} type The type of proxy that's being set ("Http",
   *     "Https", etc.).
   * @return {?ProxyServer} An object containing the proxy server host,
   *     port, and scheme.
   * @private
   */
  getProxyImpl_: function(type) {
  	if ( this.guifinet ) {
  		var data = document.getElementById('proxies_' + type + '_guifinet').value
  					.split('//').join('')
  					.split('"').join('')
  					.split(':');
  		var result = {
	      scheme: data[0],
	      host: data[1],
	      port: parseInt(data[2], 10)
	    };
	  	console.log("result?"+JSON.stringify(result));
	    return (result.scheme && result.host && result.port) ? result : undefined;
  	} else {
	    var result = {
	      scheme: document.getElementById('proxyScheme' + type).value,
	      host: document.getElementById('proxyHost' + type).value,
	      port: parseInt(document.getElementById('proxyPort' + type).value, 10)
	    };
	    return (result.scheme && result.host && result.port) ? result : undefined;
    }
  },


  /**
   * A generic mechanism for setting proxy data.
   *
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @param {string} type The type of proxy that's being set ("Http",
   *     "Https", etc.).
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   * @private
   */
  setProxyImpl_: function(type, data) {
    if (!data)
      data = {scheme: 'http', host: '', port: ''};

    console.log("setProxyImpl_> this.guifinet="+this.guifinet);
    if ( this.guifinet ) { //TODO Aquí quizá habría que seleccionar en lugar de cambiar el valor a piñón ... 
    	console.log("setProxyImpl_> "+data.scheme+ '://' +data.host+ ':' + data.port);
	    document.getElementById('proxies_' + type + "_guifinet").value = data.scheme+ '://' +data.host+ ':' + data.port;
	} else {
	    document.getElementById('proxyScheme' + type).value = data.scheme;
	    document.getElementById('proxyHost' + type).value = data.host;
	    document.getElementById('proxyPort' + type).value = data.port;
    }
    
  },
  
  fillGuifinetProxies_: function(proxyData) {
  	var selects = document.querySelectorAll('#fixed_servers_guifinet > section > fieldset > select');
  	//console.log(selects);
  	//console.log(proxyData);
  	for (var i = 0; i < selects.length; i++) {
  		selects[i].innerHTML = '';
  		for (var j = 0; j < proxyData.length; j++) {
	  		var opt = document.createElement('option');
	  		if ( j === 0 ) {
	  			opt.setAttribute('selected', 'selected');
	  		}
	  		//["http", "10.228.171.199",3128,"inforgames","En construcci&oacute;n", 4000000, 256000, "unknown", "unknown"];
	  		var str = proxyData[j][0] + '://' + proxyData[j][1] + ':' + proxyData[j][2];
	  		opt.setAttribute('value', str);
	  		str += ' [' + proxyData[j][3] + '] ' + proxyData[j][4];
	  		opt.innerHTML = str;
	  		selects[i].add(opt);
  		} 
  	}
  },

///////////////////////////////////////////////////////////////////////////////

  /**
   * Calls the proxy API to read the current settings, and populates the form
   * accordingly.
   *
   * @private
   */
  readCurrentState_: function() {
    chrome.extension.isAllowedIncognitoAccess(
        this.handleIncognitoAccessResponse_.bind(this));
  },

  /**
   * Handles the respnse from `chrome.extension.isAllowedIncognitoAccess`
   * We can't render the form until we know what our access level is, so
   * we wait until we have confirmed incognito access levels before
   * asking for the proxy state.
   *
   * @param {boolean} state The state of incognito access.
   * @private
   */
  handleIncognitoAccessResponse_: function(state) {
    this.isAllowedIncognitoAccess_ = state;
    chrome.proxy.settings.get({incognito: false},
        this.handleRegularState_.bind(this));
    if (this.isAllowedIncognitoAccess_) {
      chrome.proxy.settings.get({incognito: true},
          this.handleIncognitoState_.bind(this));
    }
  },

  /**
   * Handles the response from 'proxy.settings.get' for regular
   * settings.
   *
   * @param {ProxyFormController.WrappedProxyConfig} c The proxy data and
   *     extension's level of control thereof.
   * @private
   */
  handleRegularState_: function(c) {
    if (c.levelOfControl === ProxyFormController.LevelOfControl.AVAILABLE ||
        c.levelOfControl === ProxyFormController.LevelOfControl.CONTROLLING) {
      this.recalcFormValues_(c.value);
      this.config_.regular = c.value;
    } else {
      this.handleLackOfControl_(c.levelOfControl);
    }
  },

  /**
   * Handles the response from 'proxy.settings.get' for incognito
   * settings.
   *
   * @param {ProxyFormController.WrappedProxyConfig} c The proxy data and
   *     extension's level of control thereof.
   * @private
   */
  handleIncognitoState_: function(c) {
    if (c.levelOfControl === ProxyFormController.LevelOfControl.AVAILABLE ||
        c.levelOfControl === ProxyFormController.LevelOfControl.CONTROLLING) {
      if (this.isIncognitoMode_())
        this.recalcFormValues_(c.value);

      this.config_.incognito = c.value;
    } else {
      this.handleLackOfControl_(c.levelOfControl);
    }
  },

  /**
   * Binds event handlers for the various bits and pieces of the form that
   * are interesting to the controller.
   *
   * @private
   */
  bindEventHandlers_: function() {
    this.form_.addEventListener('click', this.dispatchFormClick_.bind(this));
  },


  /**
   * When a `click` event is triggered on the form, this function handles it by
   * analyzing the context, and dispatching the click to the correct handler.
   *
   * @param {Event} e The event to be handled.
   * @private
   * @return {boolean} True if the event should bubble, false otherwise.
   */
  dispatchFormClick_: function(e) {
    var t = e.target;

    // Case 1: "Apply"
    if (t.nodeName === 'INPUT' && t.getAttribute('type') === 'submit') {
      return this.applyChanges_(e);

    // Case 2: "Use the same proxy for all protocols" in an active section
    } else if (t.nodeName === 'INPUT' &&
               t.getAttribute('type') === 'checkbox' &&
               t.parentNode.parentNode.parentNode.classList.contains('active')
              ) {
      return this.toggleSingleProxyConfig_(e);

    // Case 3: "Flip to incognito mode."
    } else if (t.nodeName === 'BUTTON') {
      return this.toggleIncognitoMode_(e);

    // Case 4: Click on something random: maybe changing active config group?
    } else {
      // Walk up the tree until we hit `form > fieldset` or fall off the top
      while (t && (t.nodeName !== 'FIELDSET' ||
             t.parentNode.nodeName !== 'FORM')) {
        t = t.parentNode;
      }
      if (t) {
        this.changeActive_(t);
        return false;
      }
    }
    return true;
  },


  /**
   * Sets the form's active config group.
   *
   * @param {DOMElement} fieldset The configuration group to activate.
   * @private
   */
  changeActive_: function(fieldset) {
    for (var i = 0; i < this.configGroups_.length; i++) {
      var el = this.configGroups_[i];
      var radio = el.querySelector("input[type='radio']");
      if (el === fieldset) {
        el.classList.add('active');
        radio.checked = true;
      } else {
        el.classList.remove('active');
      }
    }
    this.recalcDisabledInputs_();
  },


  /**
   * Recalculates the `disabled` state of the form's input elements, based
   * on the currently active group, and that group's contents.
   *
   * @private
   */
  recalcDisabledInputs_: function() {
    var i, j;
    for (i = 0; i < this.configGroups_.length; i++) {
      var el = this.configGroups_[i];
      var inputs = el.querySelectorAll(
          "input:not([type='radio']), select, textarea");
      if (el.classList.contains('active')) {
        for (j = 0; j < inputs.length; j++) {
          inputs[j].removeAttribute('disabled');
        }
      } else {
        for (j = 0; j < inputs.length; j++) {
          inputs[j].setAttribute('disabled', 'disabled');
        }
      }
    }
  },


  /**
   * Handler called in response to click on form's submission button. Generates
   * the proxy configuration and passes it to `useCustomProxySettings`, or
   * handles errors in user input.
   *
   * Proxy errors (and the browser action's badge) are cleared upon setting new
   * values.
   *
   * @param {Event} e DOM event generated by the user's click.
   * @private
   */
  applyChanges_: function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (this.isIncognitoMode_()) {
      this.config_.incognito = this.generateProxyConfig_();
      delete this.config_.incognito.guifinet;
    } else {
      this.config_.regular = this.generateProxyConfig_();
      delete this.config_.regular.guifinet;
    }
    
    console.log("config_ "+ JSON.stringify(this.config_));
    chrome.proxy.settings.set(
        {value: this.config_.regular, scope: 'regular'},
        this.callbackForRegularSettings_.bind(this));
    chrome.extension.sendRequest({type: 'clearError'});
  },

  /**
   * Called in response to setting a regular window's proxy settings: checks
   * for `lastError`, and then sets incognito settings (if they exist).
   *
   * @private
   */
  callbackForRegularSettings_: function() {
    if (chrome.extension.lastError) {
      this.generateAlert_(chrome.i18n.getMessage('errorSettingRegularProxy'));
      return;
    }
    if (this.config_.incognito) {
      chrome.proxy.settings.set(
          {value: this.config_.incognito, scope: 'incognito_persistent'},
          this.callbackForIncognitoSettings_.bind(this));
    } else {
      if ( this.guifinet ) {
        if (this.isIncognitoMode_()) {
          this.config_.incognito.guifinet = 'true';
        } else {
          this.config_.regular.guifinet = 'true';
        }
      }
  
      ProxyFormController.setPersistedSettings(this.config_);
      this.generateAlert_(chrome.i18n.getMessage('successfullySetProxy'));
    }
  },

  /**
   * Called in response to setting an incognito window's proxy settings: checks
   * for `lastError` and sets a success message.
   *
   * @private
   */
  callbackForIncognitoSettings_: function() {
    if (chrome.extension.lastError) {
      this.generateAlert_(chrome.i18n.getMessage('errorSettingIncognitoProxy')); 
      return;
    }
    if ( this.guifinet ) {
      if (this.isIncognitoMode_()) {
        this.config_.incognito.guifinet = 'true';
      } else {
        this.config_.regular.guifinet = 'true';
      }
    }
    ProxyFormController.setPersistedSettings(this.config_);
    this.generateAlert_(
        chrome.i18n.getMessage('successfullySetProxy'));
  },

  /**
   * Generates an alert overlay inside the proxy's popup, then closes the popup
   * after a short delay.
   *
   * @param {string} msg The message to be displayed in the overlay.
   * @param {?boolean} close Should the window be closed?  Defaults to true.
   * @private
   */
  generateAlert_: function(msg, close) {
    var success = document.createElement('div');
    success.classList.add('overlay');
    success.setAttribute('role', 'alert');
    success.textContent = msg;
    document.body.appendChild(success);

    setTimeout(function() { success.classList.add('visible'); }, 10);
    setTimeout(function() {
      if (close === false)
        success.classList.remove('visible');
      else
        window.close();
    }, 4000);
  },


  /**
   * Parses the proxy configuration form, and generates a ProxyConfig object
   * that can be passed to `useCustomProxyConfig`.
   *
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @return {ProxyConfig} The proxy configuration represented by the form.
   * @private
   */
  generateProxyConfig_: function() {
    var active = document.getElementsByClassName('active')[0];
    switch (active.id) {
      case ProxyFormController.ProxyTypes.SYSTEM:
        return {mode: 'system'};
      case ProxyFormController.ProxyTypes.DIRECT:
        return {mode: 'direct'};
      case ProxyFormController.ProxyTypes.PAC:
        var pacScriptURL = this.pacURL;
        var pacManual = this.manualPac;
        if (pacScriptURL)
          return {mode: 'pac_script',
                  pacScript: {url: pacScriptURL, mandatory: true}};
        else if (pacManual)
          return {mode: 'pac_script',
                  pacScript: {data: pacManual, mandatory: true}};
        else
          return {mode: 'auto_detect'};
      case ProxyFormController.ProxyTypes.FIXED:
      case ProxyFormController.ProxyTypes.GIFINET:
      default:
        var config = {mode: 'fixed_servers'};
        if (this.singleProxy) {
          config.rules = {
            singleProxy: this.singleProxy,
            bypassList: this.bypassList
          };
        } else {
          config.rules = {
            proxyForHttp: this.httpProxy,
            proxyForHttps: this.httpsProxy,
            proxyForFtp: this.ftpProxy,
            fallbackProxy: this.fallbackProxy,
            bypassList: this.bypassList
          };
        }
        // if ( active.id === ProxyFormController.ProxyTypes.GUIFINET ) {
        	// config.guifinet = 'true';
        // }
        // console.log("config: " + JSON.stringify(config) + " c.g? " + config.guifinet);
        return config;
    }
  },


  /**
   * Sets the proper display classes based on the "Use the same proxy server
   * for all protocols" checkbox. Expects to be called as an event handler
   * when that field is clicked.
   *
   * @param {Event} e The `click` event to respond to.
   * @private
   */
  toggleSingleProxyConfig_: function(e) {
    var checkbox = e.target;
    if (checkbox.nodeName === 'INPUT' &&
        checkbox.getAttribute('type') === 'checkbox') {
      if (checkbox.checked)
        checkbox.parentNode.parentNode.classList.add('single');
      else
        checkbox.parentNode.parentNode.classList.remove('single');
    }
  },


  /**
   * Returns the form's current incognito status.
   *
   * @return {boolean} True if the form is in incognito mode, false otherwise.
   * @private
   */
  isIncognitoMode_: function(e) {
    return this.form_.parentNode.classList.contains('incognito');
  },


  /**
   * Toggles the form's incognito mode. Saves the current state to an object
   * property for later use, clears the form, and toggles the appropriate state.
   *
   * @param {Event} e The `click` event to respond to.
   * @private
   */
  toggleIncognitoMode_: function(e) {
    var div = this.form_.parentNode;
    var button = document.getElementsByTagName('button')[0];

    // Cancel the button click.
    e.preventDefault();
    e.stopPropagation();

    // If we can't access Incognito settings, throw a message and return.
    if (!this.isAllowedIncognitoAccess_) {
      var msg = "I'm sorry, Dave, I'm afraid I can't do that. Give me access " +
                "to Incognito settings by checking the checkbox labeled " +
                "'Allow in Incognito mode', which is visible at " +
                "chrome://extensions.";
      this.generateAlert_(msg, false);
      return;
    }

    if (this.isIncognitoMode_()) {
      // In incognito mode, switching to cognito.
      this.config_.incognito = this.generateProxyConfig_();
      div.classList.remove('incognito');
      this.recalcFormValues_(this.config_.regular);
      button.innerText = 'Configure incognito window settings.';
    } else {
      // In cognito mode, switching to incognito.
      this.config_.regular = this.generateProxyConfig_();
      div.classList.add('incognito');
      this.recalcFormValues_(this.config_.incognito);
      button.innerText = 'Configure regular window settings.';
    }
  },


  /**
   * Sets the form's values based on a ProxyConfig.
   *
   * @param {!ProxyConfig} c The ProxyConfig object.
   * @private
   */
  recalcFormValues_: function(c) {
    // Normalize `auto_detect`
    if (c.mode === 'auto_detect')
      c.mode = 'pac_script';
    // Activate one of the groups, based on `mode`.
//    console.log("recalcFormValues_> c="+JSON.stringify(c)+" c.g?" + c.guifinet);
    var persistedSettings = ProxyFormController.getPersistedSettings();
//    console.log("recalcFormValues_> persistedSettings="+JSON.stringify(persistedSettings)+" p.r.g?" + persistedSettings.regular.guifinet);
    var guifinet = undefined;
    if ( this.isIncognitoMode_() ) {
//    	console.log("recalcFormValues_> isIncognito");
    	guifinet = persistedSettings.incognito.guifinet != undefined && 
    				persistedSettings.incognito.guifinet;
    } else {
//    	console.log("recalcFormValues_> !isIncognito");
    	guifinet = persistedSettings.regular.guifinet != undefined && 
    				persistedSettings.regular.guifinet;
    }
//   	console.log("guifinet> "+guifinet);
//   	console.log("c.mode> "+c.mode);
    if ( c.mode === 'fixed_servers' && guifinet != undefined && guifinet ) {
//    	console.log("recalcFormValues_> _guifinet");
    	this.changeActive_(document.getElementById(c.mode + '_guifinet'));
    } else {
//    	console.log("recalcFormValues_> !_guifinet");
    	this.changeActive_(document.getElementById(c.mode));
    }
    // Populate the PAC script
    if (c.pacScript) {
      if (c.pacScript.url)
        this.pacURL = c.pacScript.url;
    } else {
      this.pacURL = '';
    }
    // Evaluate the `rules`
    if (c.rules) {
      var rules = c.rules;
      if (rules.singleProxy) {
        this.singleProxy = rules.singleProxy;
      } else {
        this.singleProxy = null;
        this.httpProxy = rules.proxyForHttp;
        this.httpsProxy = rules.proxyForHttps;
        this.ftpProxy = rules.proxyForFtp;
        this.fallbackProxy = rules.fallbackProxy;
      }
      this.bypassList = rules.bypassList;
    } else {
      this.singleProxy = {
      	  scheme: 'http',
	      host: 'localhost',
	      port: parseInt('9999', 10)
	    };
      this.httpProxy = null;
      this.httpsProxy = null;
      this.ftpProxy = null;
      this.fallbackProxy = null;
      this.bypassList = '';
    }
  },


  /**
   * Handles the case in which this extension doesn't have the ability to
   * control the Proxy settings, either because of an overriding policy
   * or an extension with higher priority.
   *
   * @param {ProxyFormController.LevelOfControl} l The level of control this
   *     extension has over the proxy settings.
   * @private
   */
  handleLackOfControl_: function(l) {
    var msg;
    if (l === ProxyFormController.LevelOfControl.NO_ACCESS)
      msg = chrome.i18n.getMessage('errorNoExtensionAccess');
    else if (l === ProxyFormController.LevelOfControl.OTHER_EXTENSION)
      msg = chrome.i18n.getMessage('errorOtherExtensionControls');
    this.generateAlert_(msg);
  },


  /**
   * Handle the case in which errors have been generated outside the context
   * of this popup.
   *
   * @private
   */
  handleProxyErrors_: function() {
    chrome.extension.sendRequest(
        {type: 'getError'},
        this.handleProxyErrorHandlerResponse_.bind(this));
  },

  /**
   * Handles response from ProxyErrorHandler
   *
   * @param {{result: !string}} response The message sent in response to this
   *     popup's request.
   */
  handleProxyErrorHandlerResponse_: function(response) {
    if (response.result !== null) {
      var error = JSON.parse(response.result);
      console.error(error);
      // TODO(mkwst): Do something more interesting
      this.generateAlert_(
          chrome.i18n.getMessage(
              error.details ? 'errorProxyDetailedError' : 'errorProxyError',
              [error.error, error.details]),
          false);
    }
  }
};
