H5P.AdvancedTextPapiJo = (function ($, EventDispatcher) {

  /**
   * A simple library for displaying text with advanced styling.
   *
   * @class H5P.AdvancedText
   * @param {Object} parameters
   * @param {string} [parameters.text='New text']
   * @param {number} id
   */
  function AdvancedText(parameters, id) {
    var self = this;
    var tooltipRuntime;
    EventDispatcher.call(this);

    var text = parameters && typeof parameters.text === 'string' ?
      parameters.text : '<em>New text</em>';
    var tooltipImages = parameters && Array.isArray(parameters.tooltipImages) ?
      parameters.tooltipImages : [];

    // Add a responsive wrapper around tables, if any.
    if (text.search('<table') !== -1) {
      text = text.replaceAll('<table', '<div style="overflow-x:auto; padding-bottom: 0.6em;"><table');
      text = text.replaceAll('</table>', '</table></div>');
    }

    var html = text;

    self.initializeTooltips = function ($container) {
      if (!$container || !$container[0] ||
          typeof H5P.AdvancedTextPapiJoTooltipRuntime !== 'function') {
        return 0;
      }

      if (!tooltipRuntime || tooltipRuntime.root !== $container[0]) {
        if (tooltipRuntime) {
          tooltipRuntime.destroy();
        }
        tooltipRuntime = new H5P.AdvancedTextPapiJoTooltipRuntime(
          $container[0],
          id,
          tooltipImages,
          function () {
            self.trigger('resize');
          }
        );
      }
      return tooltipRuntime.initialize();
    };

    /**
     * Wipe container and add text html.
     *
     * @alias H5P.AdvancedText#attach
     * @param {H5P.jQuery} $container
     */
    self.attach = function ($container) {
      if (tooltipRuntime) {
        tooltipRuntime.destroy();
        tooltipRuntime = null;
      }
      $container.addClass('h5p-advanced-text').html(html);
      self.initializeTooltips($container);
    };

  }

  AdvancedText.prototype = Object.create(EventDispatcher.prototype);
  AdvancedText.prototype.constructor = AdvancedText;

  return AdvancedText;

})(H5P.jQuery, H5P.EventDispatcher);
