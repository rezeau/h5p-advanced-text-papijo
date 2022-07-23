H5P.AdvancedTextPapiJo = (function ($, EventDispatcher) {

  /**
   * A simple library for displaying text with advanced styling.
   *
   * @class H5P.AdvancedText
   * @param {Object} parameters
   * @param {Object} [parameters.text='New text']
   * @param {number} id
   */
  function AdvancedText(parameters, id) {
    var self = this;    
    EventDispatcher.call(this);

  // Add <div style="overflow-x:auto;"> around table to make it responsive
    if (parameters.text.search('<table')) {
      parameters.text = parameters.text.replace('<table', '<div style="overflow-x:auto; padding-bottom: 0.6em;"><table');
      parameters.text = parameters.text.replace('</table>', '</table></div>');
    }

    var html = (parameters.text === undefined ? '<em>New text</em>' : parameters.text);

    /**
     * Wipe container and add text html.
     *
     * @alias H5P.AdvancedText#attach
     * @param {H5P.jQuery} $container
     */
    self.attach = function ($container) {
      $container.addClass('h5p-advanced-text').html(html);
    };

  }

  AdvancedText.prototype = Object.create(EventDispatcher.prototype);
  AdvancedText.prototype.constructor = AdvancedText;

  return AdvancedText;

})(H5P.jQuery, H5P.EventDispatcher);
