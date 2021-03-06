import {instanceDom, defaultSubtypes, empty, optionFieldsRegEx} from './dom';
import {instanceData} from './data';
import utils from './utils';
import events from './events';
import mi18n from 'mi18n';
import {config} from './config';

const opts = config.opts;
const m = utils.markup;

/**
 * Utilities specific to form-builder.js
 */
export default class Helpers {
  /**
   * Setup defaults, get instance data and dom
   * @param  {String} formID [description]
   */
  constructor(formID) {
    this.data = instanceData[formID];
    this.d = instanceDom[formID];
    this.doCancel = false;
  }

  /**
   * Callback for when a drag begins
   *
   * @param  {Object} event
   * @param  {Object} ui
   */
  startMoving(event, ui) {
    ui.item.show().addClass('moving');
    this.doCancel = true;
    this.from = ui.item.parent();
  }

  /**
   * Callback for when a drag ends
   *
   * @param  {Object} event
   * @param  {Object} ui
   */
  stopMoving(event, ui) {
    let _this = this;
    ui.item.removeClass('moving');
    if (_this.doCancel) {
      if (ui.sender) {
        $(ui.sender).sortable('cancel');
      }
      this.from.sortable('cancel');
    }
    _this.save();
    _this.doCancel = false;
  }

  /**
   * jQuery UI sortable beforeStop callback used for both lists.
   * Logic for canceling the sort or drop.
   * @param  {Object} event
   * @param  {Object} ui
   * @return {void}
   */
  beforeStop(event, ui) {
    let _this = this;
    const opts = config.opts;
    const form = _this.d.stage;
    let lastIndex = form.childNodes.length - 1;
    let cancelArray = [];
    _this.stopIndex = ui.placeholder.index() - 1;

    if (!opts.sortableControls && ui.item.parent().hasClass('frmb-control')) {
      cancelArray.push(true);
    }

    if (opts.prepend) {
      cancelArray.push(_this.stopIndex === 0);
    }

    if (opts.append) {
      cancelArray.push((_this.stopIndex + 1) === lastIndex);
    }

    _this.doCancel = cancelArray.some(elem => elem === true);
  }


  /**
   * Attempts to get element type and subtype
   *
   * @param  {Object} $field
   * @return {Object} {type: 'fieldType', subtype: 'fieldSubType'}
   */
  getTypes($field) {
    let types = {
        type: $field.attr('type')
      };
    let subtype = $('.fld-subtype', $field).val();

    if (subtype !== types.type) {
      types.subtype = subtype;
    }

    return types;
  }

  /**
   * Get option data for a field
   * @param  {Object} field jQuery field object
   * @return {Array}        Array of option values
   */
  fieldOptionData(field) {
    let options = [];

    $('.sortable-options li', field).each(function() {
      let $option = $(this);
      const selected = $('.option-selected', $option).is(':checked');
      let attrs = {
          label: $('.option-label', $option).val(),
          value: $('.option-value', $option).val()
        };

      if (selected) {
        attrs.selected = selected;
      }

      options.push(attrs);
    });

    return options;
  }

  /**
   * XML save
   *
   * @param  {Object} form sortableFields node
   * @return {String} xml in string
   */
  xmlSave(form) {
    let formData = this.prepData(form);
    let xml = ['<form-template>\n\t<fields>'];

    utils.forEach(formData, function(fieldIndex, field) {
      let fieldContent = null;
      const optionFields = optionFieldsRegEx;

      // Handle options
      if (field.type.match(optionFields)) {
        let optionData = field.values;
        let options = [];

        for (let i = 0; i < optionData.length; i++) {
          let option = m('option', optionData[i].label, optionData[i]).outerHTML;
          options.push('\n\t\t\t' + option);
        }
        options.push('\n\t\t');

        fieldContent = options.join('');
        delete field.values;
      }

      let xmlField = m('field', fieldContent, field);
      xml.push('\n\t\t' + xmlField.outerHTML);
    });

    xml.push('\n\t</fields>\n</form-template>');

    return xml.join('');
  }

  /**
   * Get formData from editor in JS Object format
   * @param  {Object} form aka stage, DOM element
   * @return {Object} formData
   */
  prepData(form) {
    let formData = [];
    let d = this.d;
    let _this = this;

    if (form.childNodes.length !== 0) {
      // build data object
      utils.forEach(form.childNodes, function(index, field) {
        let $field = $(field);

        if (!($field.hasClass('disabled-field'))) {
          let fieldData = _this.getTypes($field);
          let roleVals = $('.roles-field:checked', field).map(elem => elem.value).get();

          _this.setAttrVals(field, fieldData);

          if (fieldData.subtype) {
            if (fieldData.subtype === 'quill') {
              let id = `${fieldData.name}-preview`;
              if (window.fbEditors.quill[id]) {
                let instance = window.fbEditors.quill[id].instance;
                const data = instance.getContents();
                fieldData.value = window.JSON.stringify(data.ops);
              }
            } else if(fieldData.subtype === 'tinymce' && window.tinymce) {
              let id = `${fieldData.name}-preview`;
              if (window.tinymce.editors[id]) {
                let editor = window.tinymce.editors[id];
                fieldData.value = editor.getContent();
              }
            }
          }

          if (roleVals.length) {
            fieldData.role = roleVals.join(',');
          }

          fieldData.className = fieldData.className || fieldData.class;

          let match = /(?:^|\s)btn-(.*?)(?:\s|$)/g.exec(fieldData.className);
          if (match) {
            fieldData.style = match[1];
          }

          fieldData = utils.trimObj(fieldData);

          let multipleField = fieldData.type.match(d.optionFieldsRegEx);

          if (multipleField) {
            fieldData.values = _this.fieldOptionData($field);
          }

          formData.push(fieldData);
        }
      });
    }

    return formData;
  }

  /**
   * Get and set the data for an editor. Mainly
   * a wrapper for handling dataType option
   * @param  {Object} formData
   * @return {Object} formData
   */
  getData(formData) {
    let data = this.data;
    if (!formData) {
      formData = config.opts.formData;
    }

    if (!formData) {
      return false;
    }

    let setData = {
      xml: formData => utils.parseXML(formData),
      json: formData => window.JSON.parse(formData)
    };

    data.formData = setData[config.opts.dataType](formData) || [];

    return data.formData;
  }

  /**
   * Saves and returns formData
   * @param {Object} stage DOM element
   * @return {XML|JSON} formData
   */
  save(stage) {
    let _this = this;
    let data = this.data;
    if(!stage) {
      stage = this.d.stage;
    }
    let doSave = {
      xml: () => _this.xmlSave(stage),
      json: () =>
      window.JSON.stringify(_this.prepData(stage), null, '\t')
    };

    // save action for current `dataType`
    data.formData = doSave[config.opts.dataType](stage);

    // trigger formSaved event
    document.dispatchEvent(events.formSaved);
    return data.formData;
  }

  /**
   * increments the field ids with support for multiple editors
   * @param  {String} id field ID
   * @return {String}    incremented field ID
   */
  incrementId(id) {
    let split = id.lastIndexOf('-');
    let newFieldNumber = parseInt(id.substring(split + 1)) + 1;
    let baseString = id.substring(0, split);

    return `${baseString}-${newFieldNumber}`;
  }

  /**
   * Set the values for field attributes in the editor
   * @param {Object} field
   * @param {Object} fieldData
   */
  setAttrVals(field, fieldData) {
    let attrs = field.querySelectorAll('[class*="fld-"]');
    utils.forEach(attrs, index => {
      let attr = attrs[index];
      let value;
      let name = utils.camelCase(attr.getAttribute('name'));
      if (attr.attributes['contenteditable']) {
        value = attr.innerHTML;
      } else if (attr.type === 'checkbox') {
        value = attr.checked;
      } else {
        value = attr.value;
      }
      fieldData[name] = value;
    });
  }

  /**
   * Collect field attribute values and call fieldPreview to generate preview
   * @param  {Object} $field jQuery DOM element
   */
  updatePreview($field) {
    let _this = this;
    let d = this.d;
    const fieldClass = $field.attr('class');
    let field = $field[0];
    if (fieldClass.indexOf('input-control') !== -1) {
      return;
    }

    let fieldType = $field.attr('type');
    let $prevHolder = $('.prev-holder', field);
    let previewData = {
      type: fieldType
    };
    let preview;

    _this.setAttrVals(field, previewData);

    let style = $('.btn-style', field).val();
    if (style) {
      previewData.style = style;
    }

    if (fieldType.match(d.optionFieldsRegEx)) {
      previewData.values = [];
      previewData.multiple = $('[name="multiple"]', field).is(':checked');

      $('.sortable-options li', field).each(function(i, $option) {
        let option = {};
        option.selected = $('.option-selected', $option).is(':checked');
        option.value = $('.option-value', $option).val();
        option.label = $('.option-label', $option).val();
        previewData.values.push(option);
      });
    }

    previewData = utils.trimObj(previewData);

    previewData.className = _this.classNames(field, previewData);
    $('.fld-className', field).val(previewData.className);

    $field.data('fieldData', previewData);
    preview = utils.getTemplate(previewData, true);

    empty($prevHolder[0]);
    $prevHolder[0].appendChild(preview);
    preview.dispatchEvent(events.fieldRendered);
  }

  /**
   * Display a custom tooltip for disabled fields.
   *
   * @param  {Object} field
   */
  disabledTT(stage) {
    const move = (e, elem) => {
      const fieldOffset = elem.field.getBoundingClientRect();
      const x = e.clientX - fieldOffset.left - 21;
      const y = e.clientY - fieldOffset.top - elem.tt.offsetHeight - 12;
      elem.tt.style.transform = `translate(${x}px, ${y}px)`;
    };

    const disabledFields = stage.querySelectorAll('.disabled-field');
    utils.forEach(disabledFields, index => {
      let field = disabledFields[index];
      let title = opts.messages.fieldNonEditable;

      if (title) {
        let tt = utils.markup('p', title, {className: 'frmb-tt'});
        field.appendChild(tt);
        field.addEventListener('mousemove', e => move(e, {tt, field}));
      }
    });
  }

  /**
   * Process classNames for field
   * @param  {Object} field
   * @param  {Object} previewData
   * @return {String} classNames
   */
  classNames(field, previewData) {
    let className = field.querySelector('.fld-className');
    if (!className) {
      return;
    }
    let i;
    let type = previewData.type;
    let style = previewData.style;
    let classes = className.value.split(' ');
    let types = {
      button: 'btn',
      submit: 'btn'
    };

    let primaryType = types[type];

    if (primaryType) {
      if (style) {
        for (i = 0; i < classes.length; i++) {
          let re = new RegExp(`(?:^|\s)${primaryType}-(.*?)(?:\s|$)+`, 'g');
          let match = classes[i].match(re);
          if (match) {
            classes.splice(i, 1);
          }
        }
        classes.push(primaryType + '-' + style);
      }
      classes.push(primaryType);
    }

    // reverse the array to put custom classes at end,
    // remove any duplicates, convert to string, remove whitespace
    return utils.unique(classes).join(' ').trim();
  }

  /**
   * Closes and open dialog
   *
   * @param  {Object} overlay Existing overlay if there is one
   * @param  {Object} dialog  Existing dialog
   */
  closeConfirm(overlay, dialog) {
    if (!overlay) {
      overlay = document.getElementsByClassName('form-builder-overlay')[0];
    }
    if (!dialog) {
      dialog = document.getElementsByClassName('form-builder-dialog')[0];
    }
    overlay.classList.remove('visible');
    dialog.remove();
    overlay.remove();
    document.dispatchEvent(events.modalClosed);
  }

  /**
   * Returns the layout data based on controlPosition option
   * @param  {String} controlPosition 'left' or 'right'
   * @return {Object} layout object
   */
  editorLayout(controlPosition) {
    let layoutMap = {
      left: {
        stage: 'pull-right',
        controls: 'pull-left'
      },
      right: {
        stage: 'pull-left',
        controls: 'pull-right'
      }
    };

    return layoutMap[controlPosition] ? layoutMap[controlPosition] : '';
  }

  /**
   * Adds overlay to the page. Used for modals.
   * @return {Object} DOM Object
   */
  showOverlay() {
    const _this = this;
    let overlay = utils.markup('div', null, {
      className: 'form-builder-overlay'
    });
    document.body.appendChild(overlay);
    overlay.classList.add('visible');

    overlay.onclick = function() {
      _this.closeConfirm(overlay);
    };

    return overlay;
  }

  /**
   * Custom confirmation dialog
   *
   * @param  {Object}  message   Content to be displayed in the dialog
   * @param  {Func}  yesAction callback to fire if they confirm
   * @param  {Boolean} coords    location to put the dialog
   * @param  {String}  className Custom class to be added to the dialog
   * @return {Object}            Reference to the modal
   */
  confirm(message, yesAction, coords = false, className = '') {
    const _this = this;
    let i18n = mi18n.current;
    let overlay = _this.showOverlay();
    let yes = m('button', i18n.yes, {
      className: 'yes btn btn-success btn-sm'
    });
    let no = m('button', i18n.no, {
      className: 'no btn btn-danger btn-sm'
    });

    no.onclick = function() {
      _this.closeConfirm(overlay);
    };

    yes.onclick = function() {
      yesAction();
      _this.closeConfirm(overlay);
    };

    let btnWrap = m('div', [no, yes], {className: 'button-wrap'});

    className = 'form-builder-dialog ' + className;

    let miniModal = m('div', [message, btnWrap], {className});
    if (!coords) {
      const dE = document.documentElement;
      coords = {
        pageX: Math.max(dE.clientWidth, window.innerWidth || 0) / 2,
        pageY: Math.max(dE.clientHeight, window.innerHeight || 0) / 2
      };
      miniModal.style.position = 'fixed';
    } else {
      miniModal.classList.add('positioned');
    }

    miniModal.style.left = coords.pageX + 'px';
    miniModal.style.top = coords.pageY + 'px';

    document.body.appendChild(miniModal);

    yes.focus();
    return miniModal;
  }

  /**
   * Popup dialog the does not require confirmation.
   * @param  {String|DOM|Array}  content
   * @param  {Boolean} coords    false if no coords are provided. Without coordinates
   *                             the popup will appear center screen.
   * @param  {String}  className classname to be added to the dialog
   * @return {Object}            dom
   */
  dialog(content, coords = false, className = '') {
    const _this = this;
    let clientWidth = document.documentElement.clientWidth;
    let clientHeight = document.documentElement.clientHeight;
    _this.showOverlay();

    className = 'form-builder-dialog ' + className;

    let miniModal = utils.markup('div', content, {className: className});
    if (!coords) {
      coords = {
        pageX: Math.max(clientWidth, window.innerWidth || 0) / 2,
        pageY: Math.max(clientHeight, window.innerHeight || 0) / 2
      };
      miniModal.style.position = 'fixed';
    } else {
      miniModal.classList.add('positioned');
    }

    miniModal.style.left = coords.pageX + 'px';
    miniModal.style.top = coords.pageY + 'px';

    document.body.appendChild(miniModal);

    document.dispatchEvent(events.modalOpened);

    if (className.indexOf('data-dialog') !== -1) {
      document.dispatchEvent(events.viewData);
    }

    return miniModal;
  }

  /**
   * Confirm all fields will be removed then remove them
   * @param  {Object} e click event object
   */
  confirmRemoveAll(e) {
    let _this = this;
    let formID = e.target.id.match(/frmb-\d{13}/)[0];
    let stage = document.getElementById(formID);
    let i18n = mi18n.current;
    let fields = $('li.form-field', stage);
    let buttonPosition = e.target.getBoundingClientRect();
    let bodyRect = document.body.getBoundingClientRect();
    let coords = {
      pageX: buttonPosition.left + (buttonPosition.width / 2),
      pageY: (buttonPosition.top - bodyRect.top) - 12
    };

    if (fields.length) {
      _this.confirm(i18n.clearAllMessage, function() {
        _this.removeAllFields.call(_this, stage);
        config.opts.notify.success(i18n.allFieldsRemoved);
        config.opts.onClearAll();
      }, coords);
    } else {
      _this.dialog(i18n.noFieldsToClear, coords);
    }
  }

  /**
   * Removes all fields from the form
   * @param {Boolean} animate whether to animate or not
   * @return {void}
   */
  removeAllFields(stage, animate = true) {
    let i18n = mi18n.current;
    let opts = config.opts;
    let fields = stage.querySelectorAll('li.form-field');
    let markEmptyArray = [];

    if (!fields.length) {
      return false;
    }

    if (opts.prepend) {
      markEmptyArray.push(true);
    }

    if (opts.append) {
      markEmptyArray.push(true);
    }

    if (!markEmptyArray.some(elem => elem === true)) {
      stage.parentElement.classList.add('empty');
      stage.parentElement.dataset.content = i18n.getStarted;
    }

    if (animate) {
      stage.classList.add('removing');
      let outerHeight = 0;
      utils.forEach(fields, index =>
        outerHeight += fields[index].offsetHeight + 3);
      fields[0].style.marginTop = `${-outerHeight}px`;
      setTimeout(() => {
        empty(stage).classList.remove('removing');
      }, 400);
    } else {
      empty(stage);
    }
  }

  /**
   * If user re-orders the elements their order should be saved.
   *
   * @param {Object} $cbUL our list of elements
   */
  setFieldOrder($cbUL) {
    if (!config.opts.sortableControls) {
      return false;
    }

    let fieldOrder = {};

    $cbUL.children().each(function(index, element) {
      fieldOrder[index] = $(element).data('type');
    });

    if (window.sessionStorage) {
      window.sessionStorage.setItem('fieldOrder', window.JSON.stringify(fieldOrder));
    }
  }

  /**
   * Reorder the controls if the user has previously ordered them.
   *
   * @param  {Array} frmbFields
   * @return {Array} ordered fields
   */
  orderFields(frmbFields) {
    const opts = config.opts;
    let fieldOrder = false;
    let newOrderFields = [];

    if (window.sessionStorage) {
      if (opts.sortableControls) {
        fieldOrder = window.sessionStorage.getItem('fieldOrder');
      } else {
        window.sessionStorage.removeItem('fieldOrder');
      }
    }

    if (!fieldOrder) {
      let controlOrder = opts.controlOrder.concat(frmbFields.map(field =>
        field.attrs.type));
      fieldOrder = utils.unique(controlOrder);
    } else {
      fieldOrder = window.JSON.parse(fieldOrder);
      fieldOrder = Object.keys(fieldOrder).map(function(i) {
        return fieldOrder[i];
      });
    }


    fieldOrder.forEach((fieldType) => {
      let field = frmbFields.filter(function(field) {
        return field.attrs.type === fieldType;
      })[0];
      newOrderFields.push(field);
    });

    return newOrderFields.filter(Boolean);
  }

  /**
   * Close fields being editing
   * @param  {Object} stage
   */
  closeAllEdit() {
    const _this = this;
    const fields = $('> li.editing', _this.d.stage);
    const toggleBtns = $('.toggle-form', _this.d.stage);
    const editPanels = $('.frm-holder', fields);

    toggleBtns.removeClass('open');
    fields.removeClass('editing');
    $('.prev-holder', fields).show();
    editPanels.hide();
  }

  /**
   * Toggles the edit mode for the given field
   * @param  {String} fieldId
   * @param  {Boolean} animate
   */
  toggleEdit(fieldId, animate = true) {
    const field = document.getElementById(fieldId);
    const toggleBtn = $('.toggle-form', field);
    const editPanel = $('.frm-holder', field);
    field.classList.toggle('editing');
    toggleBtn.toggleClass('open');
    if (animate) {
      $('.prev-holder', field).slideToggle(250);
      editPanel.slideToggle(250);
    } else {
      $('.prev-holder', field).toggle();
      editPanel.toggle();
    }
    this.updatePreview($(field));
  }

  /**
   * Controls follow scroll to the bottom of the editor
   */
  stickyControls() {
    let d = this.d;
    const $cbWrap = $(d.controls).parent();
    const $stageWrap = $(d.stage).parent();
    const cbWidth = $cbWrap.width();
    const cbPosition = d.controls.getBoundingClientRect();

    $(window).scroll(function(evt) {
      let scrollTop = $(evt.target).scrollTop();
      const offsetDefaults = {
        top: 5,
        bottom: 'auto',
        right: 'auto',
        left: cbPosition.left
      };

      let offset = Object.assign({}, offsetDefaults, config.opts.stickyControls.offset);

      if (scrollTop > $stageWrap.offset().top) {
        const style = {
          position: 'fixed',
          width: cbWidth
        };

        const cbStyle = Object.assign(style, offset);

        let cbOffset = $cbWrap.offset();
        let stageOffset = $stageWrap.offset();
        let cbBottom = cbOffset.top + $cbWrap.height();
        let stageBottom = stageOffset.top + $stageWrap.height();

        if (cbBottom > stageBottom && (cbOffset.top !== stageOffset.top)) {
          $cbWrap.css({
            position: 'absolute',
            top: 'auto',
            bottom: 0,
            right: 0,
            left: 'auto'
          });
        }

        if (cbBottom < stageBottom || (cbBottom === stageBottom && cbOffset.top > scrollTop)) {
          $cbWrap.css(cbStyle);
        }
      } else {
        d.controls.parentElement.removeAttribute('style');
      }
    });
  }

  /**
   * Open a dialog with the form's data
   */
  showData(e) {
    const data = this.data;
    const formData = utils.escapeHtml(data.formData);
    const code = m('code', formData, {
      className: `formData-${config.opts.dataType}`
    });

    this.dialog(m('pre', code), null, 'data-dialog');
  }

  /**
   * Remove a field from the stage
   * @param  {String}  fieldID ID of the field to be removed
   * @return {Boolean} fieldRemoved returns true if field is removed
   */
  removeField(fieldID) {
    let fieldRemoved = false;
    let _this = this;
    const form = this.d.stage;
    const fields = form.getElementsByClassName('form-field');

    if (!fields.length) {
      console.warn('No fields to remove');
      return false;
    }

    if (!fieldID) {
      let availableIds = [].slice.call(fields).map((field) => {
        return field.id;
      });
      console.warn('fieldID required to remove specific fields. Removing last field since no ID was supplied.');
      console.warn('Available IDs: ' + availableIds.join(', '));
      fieldID = form.lastChild.id;
    }

    const field = document.getElementById(fieldID);
    const $field = $(field);
    if (!field) {
      console.warn('Field not found');
      return false;
    }

    $field.slideUp(250, function() {
      $field.removeClass('deleting');
      $field.remove();
      fieldRemoved = true;
      _this.save();
      if (!form.childNodes.length) {
        let stageWrap = form.parentElement;
        stageWrap.classList.add('empty');
        stageWrap.dataset.content = mi18n.current.getStarted;
      }
    });

    document.dispatchEvent(events.fieldRemoved);
    return fieldRemoved;
  }

  /**
   * Generate markup for form action buttons
   * @param  {Object} buttonData
   * @return {Object} DOM element for action button
   */
  processActionButtons(buttonData) {
    let {label, events, ...attrs} = buttonData;
    let data = this.data;
    if (!label) {
      if (attrs.id) {
        label = mi18n.current[attrs.id] || utils.capitalize(attrs.id);
      } else {
        label = '';
      }
    } else {
      label = mi18n.current[label] || '';
    }

    if (!attrs.id) {
      attrs.id = `${data.formID}-action-${Math.round(Math.random()*1000)}`;
    } else {
      attrs.id = `${data.formID}-${attrs.id}-action`;
    }

    const button = m('button', label, attrs);

    if (events) {
      for (let event in events) {
        if (events.hasOwnProperty(event)) {
          button.addEventListener(event, evt => events[event](evt));
        }
      }
    }

    return button;
  }

  /**
   * Cross link subtypes and define markup config
   * @param  {Array} subtypeOpts
   * @return {Array} subtypes
   */
  processSubtypes(subtypeOpts) {
    let subtypes = {};
    const subtypeFormat = subtype => {
        return {
          label: mi18n.get(subtype),
          value: subtype
        };
      };

      config.subtypes = utils.merge(defaultSubtypes, subtypeOpts);

      for (let subtype in config.subtypes) {
        if (config.subtypes.hasOwnProperty(subtype)) {
          subtypes[subtype] = config.subtypes[subtype].map(subtypeFormat);
        }
      }

      return subtypes;
  }

  /**
   * Generate stage and controls dom elements
   * @param  {String} formID [description]
   */
  editorUI(formID) {
    let d = this.d;
    let data = this.data;
    d.stage = m('ul', null, {
        id: data.formID,
        className: 'frmb'
      });

    // Create draggable fields for formBuilder
    d.controls = m('ul', null, {
      id: `${data.formID}-control-box`,
      className: 'frmb-control'
    });
  }

  /**
   * Process user options for actionButtons
   * @param  {Object} options
   * @return {Object} processedOptions
   */
  processOptions(options) {
    const _this = this;
    let {fields = [], templates, ...opts} = options;
    let actionButtons = [{
      id: 'clear',
      className: 'clear-all btn btn-danger',
      events: {
        click: _this.confirmRemoveAll.bind(_this)
      }
    }, {
      label: 'viewJSON',
      id: 'data',
      className: 'btn btn-default',
      events: {
        click: _this.showData.bind(_this)
      }
    }, {
      id: 'save',
      type: 'button',
      className: 'btn btn-primary save-template',
      events: {
        click: evt => {
          _this.save();
          config.opts.onSave(evt, _this.data.formData);
        }
      }
    }];

    let defaultFields = [
      {
        label: mi18n.get('autocomplete'),
        attrs: {
          type: 'autocomplete'
        }
      }, {
        label: mi18n.get('button'),
        attrs: {
          type: 'button',
        }
      }, {
        label: mi18n.get('checkboxGroup'),
        attrs: {
          type: 'checkbox-group',
        }
      }, {
        label: mi18n.get('dateField'),
        attrs: {
          type: 'date',
        }
      }, {
        label: mi18n.get('fileUpload'),
        attrs: {
          type: 'file',
        }
      }, {
        label: mi18n.get('header'),
        attrs: {
          type: 'header',
        }
      }, {
        label: mi18n.get('hidden'),
        attrs: {
          type: 'hidden',
        }
      }, {
        label: mi18n.get('number'),
        attrs: {
          type: 'number',
        }
      }, {
        label: mi18n.get('paragraph'),
        attrs: {
          type: 'paragraph',
        }
      }, {
        label: mi18n.get('radioGroup'),
        attrs: {
          type: 'radio-group',
        }
      }, {
        label: mi18n.get('select'),
        attrs: {
          type: 'select',
        }
      }, {
        label: mi18n.get('text'),
        attrs: {
          type: 'text',
        }
      }, {
        label: mi18n.get('textArea'),
        attrs: {
          type: 'textarea'
        }
      }
    ];

    opts.fields = fields.concat(defaultFields);
    config.opts = Object.assign({}, {actionButtons, templates, fields}, opts);
    let userTemplates = Object.keys(config.opts.templates).map(key => {
      return [key, config.opts.templates[key]];
    });
    utils.templates = utils.templates.concat(userTemplates);

    return config.opts;
  }


  // end class
}

// export default Helpers;
