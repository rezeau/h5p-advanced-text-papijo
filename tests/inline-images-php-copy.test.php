<?php
declare(strict_types=1);

// Actual PHP editor/file storage/export methods, isolated from the CMS/database.
$installed = 'C:/my_first_h5p_environment/libraries/';
require_once $installed . 'h5p-php-library/h5p.classes.php';
require_once $installed . 'h5p-php-library/h5p-file-storage.interface.php';
require_once $installed . 'h5p-php-library/h5p-default-storage.class.php';
require_once $installed . 'h5p-editor-php-library/h5peditor.class.php';

function copyCheck(bool $condition, string $message): void {
  if (!$condition) { throw new RuntimeException($message); }
}

final class InlineCopyCore {
  public $fs, $relativePathRegExp;
  public function loadLibrarySemantics($name, $major, $minor) {
    $file = $name === 'H5P.AdvancedTextPapiJo' ? __DIR__ . '/../semantics.json' :
      'C:/my_first_h5p_environment/libraries/' . $name . '-' . $major . '.' . $minor . '/semantics.json';
    return json_decode(file_get_contents($file));
  }
}
final class InlineCopyStorage {
  public $kept = array();
  public function keepFile($id) { $this->kept[] = $id; }
}
final class InlineCopyFramework {
  public $exports = 0;
  public function t($message) { return $message; }
  public function setErrorMessage($message, $code = null) { throw new RuntimeException($message); }
  public function afterExportCreated($content, $filename) { $this->exports++; }
}

$temporary = sys_get_temp_dir() . '/papijo-inline-copy-' . bin2hex(random_bytes(8));
mkdir($temporary);
try {
  $core = new InlineCopyCore();
  $core->fs = new H5PDefaultStorage($temporary);
  // Read the expression from the installed core, instead of inventing a test regex.
  preg_match('/relativePathRegExp = \'([^\']+)\'/', file_get_contents($installed . 'h5p-php-library/h5p.classes.php'), $regexp);
  copyCheck(isset($regexp[1]), 'Installed relative-path expression missing');
  $core->relativePathRegExp = $regexp[1];
  $storage = new InlineCopyStorage();
  $editorClass = new ReflectionClass('H5peditor');
  $editor = $editorClass->newInstanceWithoutConstructor();
  foreach (array('h5p' => $core, 'storage' => $storage) as $property => $value) {
    $editorClass->getProperty($property)->setValue($editor, $value);
  }
  $sourceFolder = 'C:/my_first_h5p_environment/content/text-01/';
  $source = json_decode(file_get_contents(__DIR__ . '/fixtures/inline-image-copy-source.json'));
  mkdir($temporary . '/content/42/images', 0777, true);
  foreach (array_merge($source->inlineImages, $source->tooltipImages) as $entry) {
    copyCheck(copy($sourceFolder . $entry->image->path, $temporary . '/content/42/' . $entry->image->path), 'Source fixture must exist');
  }
  $framework = new InlineCopyFramework();
  $export = (new ReflectionClass('H5PExport'))->newInstanceWithoutConstructor();
  $export->h5pF = $framework;
  $export->h5pC = $core;
  $destination = 50;
  foreach (array('standalone', 'accordion', 'column') as $container) {
    foreach (array('../42/', '../content/42/', '../../content/42/') as $prefix) {
      $destination++;
      $child = json_decode(json_encode($source));
      foreach (array_merge($child->inlineImages, $child->tooltipImages) as $entry) {
        $entry->image->path = $prefix . $entry->image->path;
      }
      $library = array('name' => 'H5P.AdvancedTextPapiJo', 'majorVersion' => 1, 'minorVersion' => 2);
      $params = $child;
      $action = (object) array('library' => 'H5P.AdvancedTextPapiJo 1.2', 'params' => $child, 'subContentId' => 'new-child-id');
      if ($container === 'accordion') {
        $library = array('name' => 'H5P.AccordionPapiJo', 'majorVersion' => 1, 'minorVersion' => 1);
        $params = (object) array('panels' => array((object) array('title' => 'Copied child', 'content' => $action)));
      }
      elseif ($container === 'column') {
        $library = array('name' => 'H5P.ColumnPapiJo', 'majorVersion' => 1, 'minorVersion' => 20);
        $params = (object) array('content' => array((object) array('content' => $action)));
      }
      $editor->processParameters($destination, $library, $params);
      foreach (array('inlineImages', 'tooltipImages') as $store) {
        foreach ($child->{$store} as $index => $entry) {
          $original = $source->{$store}[$index];
          copyCheck($entry->image->path === $original->image->path, 'Semantic save must rewrite to local image path');
          copyCheck($entry->id === $original->id && $entry->alt === $original->alt, 'Save must preserve managed ID and alt');
          copyCheck(hash_file('sha256', $temporary . '/content/' . $destination . '/' . $entry->image->path) ===
            hash_file('sha256', $sourceFolder . $original->image->path), 'Real storage must clone identical bytes');
        }
      }
      copyCheck($child->text === $source->text, 'Save must preserve marker HTML');
      // Saving already-local paths must keep the existing files.
      $before = count($storage->kept);
      $editor->processParameters($destination, $library, $params);
      copyCheck(count($storage->kept) - $before === count($child->inlineImages) + count($child->tooltipImages), 'Local re-save must keep both semantic stores');

      $content = array('id' => $destination, 'slug' => 'inline-copy', 'title' => 'Copy fixture',
        'library' => $library, 'embedType' => 'div', 'filtered' => json_encode($params),
        'dependencies' => array(), 'metadata' => array());
      copyCheck($export->createExportFile($content), 'Actual H5PExport must export isolated content');
      $archive = new ZipArchive();
      copyCheck($archive->open($temporary . '/exports/inline-copy-' . $destination . '.h5p') === true, 'Export zip must open');
      $extracted = $temporary . '/import-' . $destination;
      copyCheck($archive->extractTo($extracted), 'Export must extract'); $archive->close();
      $core->fs->saveContent($extracted . '/content', array('id' => $destination + 100));
      copyCheck(json_decode(file_get_contents($temporary . '/content/' . ($destination + 100) . '/content.json')) == $params, 'Reimported content must preserve parameters');
      foreach (array_merge($child->inlineImages, $child->tooltipImages) as $entry) {
        copyCheck(is_file($temporary . '/content/' . ($destination + 100) . '/' . $entry->image->path), 'Reimport must be self-contained');
        copyCheck(hash_file('sha256', $temporary . '/content/' . ($destination + 100) . '/' . $entry->image->path) ===
          hash_file('sha256', $temporary . '/content/' . $destination . '/' . $entry->image->path), 'Reimported bytes must match');
      }
      echo 'PHP COPY/SAVE/CONTENT EXPORT/REIMPORT PASS ' . $container . ' ' . $prefix . "\n";
      if ($container === 'column' && $prefix === '../42/') {
        // A saved CMS child already owns local files before a second copy.
        $secondChild = json_decode(json_encode($child));
        foreach (array_merge($secondChild->inlineImages, $secondChild->tooltipImages) as $entry) {
          $entry->image->path = '../' . $destination . '/' . $entry->image->path;
        }
        $secondParent = (object) array('panels' => array((object) array('title' => 'Second copy', 'content' =>
          (object) array('library' => 'H5P.AdvancedTextPapiJo 1.2', 'params' => $secondChild))));
        $editor->processParameters(200, array('name' => 'H5P.AccordionPapiJo', 'majorVersion' => 1, 'minorVersion' => 1), $secondParent);
        foreach (array_merge($secondChild->inlineImages, $secondChild->tooltipImages) as $entry) {
          copyCheck(strpos($entry->image->path, 'images/') === 0 && is_file($temporary . '/content/200/' . $entry->image->path),
            'Second PHP-backed child copy must own destination-local files');
        }
        echo "PHP SAVED COLUMN CHILD -> ACCORDION COPY/SAVE PASS\n";
      }
    }
  }
  copyCheck($framework->exports === 9, 'All PHP fixture exports must complete');
}
finally {
  // Only this test's unique temporary tree; never a site/content/library directory.
  $resolved = realpath($temporary);
  $tempRoot = realpath(sys_get_temp_dir());
  copyCheck($resolved !== false && dirname($resolved) === $tempRoot && strpos(basename($resolved), 'papijo-inline-copy-') === 0, 'Unsafe cleanup target');
  H5PCore::deleteFileTree($resolved);
}
