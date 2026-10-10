<?php
declare(strict_types=1);

// Real installed validator/core; filesystem-backed framework replaces only DB
// lookup. Release libraries are read directly from the actual checkouts, and
// their manifest versions are verified, never rewritten or prospectively mocked.
$installed = rtrim(getenv('PAPIJO_PHP_ROOT') ?: 'C:/my_first_h5p_environment/libraries', '/\\');
require_once $installed . '/h5p-php-library/h5p.classes.php';

function rcCheck(bool $condition, string $message): void {
  if (!$condition) { throw new RuntimeException($message); }
}

final class CandidateFramework {
  public $roots;
  public function __construct() {
    $root = dirname(__DIR__);
    $this->roots = array(
      'H5P.AdvancedTextPapiJo' => $root,
      'H5PEditor.AdvancedTextPapiJoTooltip' => $root . '/editor',
      'H5P.AccordionPapiJo' => dirname($root) . '/papi-jo-h5p-accordion',
      'H5P.ColumnPapiJo' => dirname($root) . '/papi-jo-h5p-column',
      'H5P.InteractiveBookPapiJo' => dirname($root) . '/papi-jo-h5p-interactivebook'
    );
  }
  public function root($name, $major, $minor) {
    return $this->roots[$name] ?? 'C:/my_first_h5p_environment/libraries/' . $name . '-' . $major . '.' . $minor;
  }
  public function loadLibrary($name, $major, $minor) {
    $file = $this->root($name, $major, $minor) . '/library.json';
    rcCheck(is_file($file), 'Missing real dependency: ' . $file);
    $manifest = json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
    rcCheck($manifest['machineName'] === $name && $manifest['majorVersion'] === (int) $major && $manifest['minorVersion'] === (int) $minor,
      'Actual manifest must match requested dependency: ' . $name . ' ' . $major . '.' . $minor);
    return $manifest;
  }
  public function loadLibrarySemantics($name, $major, $minor) {
    $this->loadLibrary($name, $major, $minor);
    return file_get_contents($this->root($name, $major, $minor) . '/semantics.json');
  }
  public function alterLibrarySemantics(&$semantics, $name, $major, $minor) {}
  public function t($message, $replacements = array()) { return strtr($message, $replacements); }
  public function setErrorMessage($message, $code = null) { throw new RuntimeException($message); }
}

$framework = new CandidateFramework();
$core = (new ReflectionClass('H5PCore'))->newInstanceWithoutConstructor();
$core->h5pF = $framework;
// Reflection bypasses constructor initialization; use the installed constructor's
// own relative-path expression, as the established file lifecycle harness does.
preg_match('/relativePathRegExp = \'([^\']+)\'/', file_get_contents($installed . '/h5p-php-library/h5p.classes.php'), $regexp);
rcCheck(isset($regexp[1]), 'Installed relative-path pattern must exist');
$core->relativePathRegExp = $regexp[1];
$expected = array('H5P.AdvancedTextPapiJo' => array(1, 3, 0), 'H5PEditor.AdvancedTextPapiJoTooltip' => array(1, 2, 0),
  'H5P.AccordionPapiJo' => array(1, 2, 0), 'H5P.ColumnPapiJo' => array(1, 21, 0), 'H5P.InteractiveBookPapiJo' => array(1, 17, 0));
foreach ($expected as $name => $version) {
  $manifest = $core->loadLibrary($name, $version[0], $version[1]);
  rcCheck($manifest['patchVersion'] === $version[2], 'Actual patch version: ' . $name);
}
$legacyCases = array(
  (object) array('text' => '<p>Plain rich text.</p>'),
  (object) array('text' => '<p><strong>Bold</strong> <em>italic</em> <a href="https://example.com/">link</a></p>'),
  (object) array('text' => '<p><span class="papijo-tooltip" data-papijo-tooltip="A &lt;strong&gt;term&lt;/strong&gt;">Tooltip</span></p>'),
  (object) array('text' => '<p><span class="papijo-tooltip" data-papijo-tooltip="Photo" data-papijo-tooltip-id="legacy-tip">Tooltip image</span></p>',
    'tooltipImages' => array((object) array('id' => 'legacy-tip', 'image' => (object) array('path' => 'images/legacy.png', 'mime' => 'image/png', 'width' => 32, 'height' => 16), 'alt' => 'Legacy photo')))
);
$managed = json_decode(file_get_contents(__DIR__ . '/fixtures/inline-image-copy-source.json'));
$managed->text = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="' . $managed->inlineImages[0]->id .
  '" data-papijo-inline-image-style="alignLeft" data-papijo-inline-image-width="55.5" data-papijo-inline-image-link="https://example.com/image"><span class="papijo-image-caption">Occurrence caption</span></span></p>';

foreach (array_merge($legacyCases, array($managed)) as $index => $original) {
  foreach (array('H5P.AdvancedTextPapiJo', 'H5P.AccordionPapiJo', 'H5P.ColumnPapiJo', 'H5P.InteractiveBookPapiJo', 'ColumnWithAccordion', 'BookWithAccordion') as $host) {
    $nestedAccordion = $host === 'ColumnWithAccordion' || $host === 'BookWithAccordion';
    $parentName = $host === 'ColumnWithAccordion' ? 'H5P.ColumnPapiJo' : ($host === 'BookWithAccordion' ? 'H5P.InteractiveBookPapiJo' : $host);
    $childParams = json_decode(json_encode($original));
    $childParams->unknownReleaseProbe = 'must disappear';
    $childParams->text .= '<p onclick="alert(1)">Filtering<img src="https://example.com/unmanaged.png" alt="unmanaged"></p>';
    $child = (object) array('library' => 'H5P.AdvancedTextPapiJo 1.3', 'params' => $childParams);
    $accordion = (object) array('library' => 'H5P.AccordionPapiJo 1.2', 'params' => (object) array('panels' => array((object) array('title' => 'Actual nested candidate', 'content' => $child))));
    $column = (object) array('content' => array((object) array('content' => $nestedAccordion ? $accordion : $child)));
    $params = $childParams;
    if ($parentName === 'H5P.AccordionPapiJo') { $params = (object) array('panels' => array((object) array('title' => 'Actual candidate', 'content' => $child))); }
    if ($parentName === 'H5P.ColumnPapiJo') { $params = $column; }
    if ($parentName === 'H5P.InteractiveBookPapiJo') { $params = (object) array('chapters' => array((object) array('library' => 'H5P.ColumnPapiJo 1.21', 'params' => $column))); }
    $v = $expected[$parentName];
    $value = (object) array('library' => $parentName . ' ' . $v[0] . '.' . $v[1], 'params' => $params);
    $validator = new H5PContentValidator($framework, $core);
    $validator->validateLibrary($value, (object) array('type' => 'library', 'options' => array($value->library)));
    rcCheck($value !== null && $child->params !== null, 'Nested candidate survives: ' . $parentName);
    if ($parentName === 'H5P.AccordionPapiJo') { rcCheck($value->params->panels[0]->content === $child, 'Accordion retains child'); }
    if ($parentName === 'H5P.ColumnPapiJo') { rcCheck($value->params->content[0]->content === ($nestedAccordion ? $accordion : $child), 'Column retains child'); }
    if ($parentName === 'H5P.InteractiveBookPapiJo') { rcCheck($value->params->chapters[0]->params->content[0]->content === ($nestedAccordion ? $accordion : $child), 'Book retains nested child'); }
    if ($nestedAccordion) { rcCheck($accordion->params->panels[0]->content === $child, 'Nested Accordion retains Text'); }
    rcCheck(!isset($childParams->unknownReleaseProbe), 'Normal semantic property filtering remains active');
    rcCheck($childParams->text === $original->text . '<p>Filtering</p>', 'Formatting/tooltip/marker preservation and real HTML filtering: ' . $parentName);
    if ($index < count($legacyCases)) { rcCheck(!property_exists($childParams, 'inlineImages'), 'No synthetic inlineImages for old content'); }
    else { rcCheck($childParams->inlineImages == $original->inlineImages, 'Managed semantic store survives'); }
    if (isset($original->tooltipImages)) { rcCheck($childParams->tooltipImages == $original->tooltipImages, 'Existing tooltip images survive'); }
    $dependencies = $validator->getDependencies();
    $needed = array('H5P.AdvancedTextPapiJo', $parentName);
    if ($nestedAccordion) { $needed[] = 'H5P.AccordionPapiJo'; }
    if ($parentName === 'H5P.InteractiveBookPapiJo') { $needed[] = 'H5P.ColumnPapiJo'; }
    foreach (array_unique($needed) as $name) {
      $library = $dependencies['preloaded-' . $name]['library'] ?? null;
      rcCheck($library !== null && array($library['majorVersion'], $library['minorVersion'], $library['patchVersion']) === $expected[$name], 'Exact dependency traversal: ' . $name);
    }
    $editor = $dependencies['editor-H5PEditor.AdvancedTextPapiJoTooltip']['library'] ?? null;
    rcCheck($editor !== null && array($editor['majorVersion'], $editor['minorVersion'], $editor['patchVersion']) === array(1, 2, 0), 'Editor dependency resolves actual 1.2.0');
    echo 'ACTUAL CANDIDATE VALIDATOR/FILTER/DEPENDENCIES PASS ' . $value->library . ($nestedAccordion ? ' -> Accordion 1.2' : '') . ' -> AdvancedText 1.3 -> editor 1.2.0; ' . ($index < 4 ? 'legacy case ' . ($index + 1) . ' (no inlineImages)' : 'managed image/caption') . "\n";
  }
}
