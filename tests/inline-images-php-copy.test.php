<?php
declare(strict_types=1);

// Actual PHP editor/file storage/export methods, isolated from the CMS/database.
$installed = rtrim(getenv('PAPIJO_PHP_ROOT') ?: 'C:/my_first_h5p_environment/libraries/', '/\\') . '/';
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
final class InlineRetainedFileStorage extends H5PDefaultStorage {
  public function removeContentFile($file, $contentId) {
    throw new RuntimeException('Retained semantic image must not be deleted: ' . $file);
  }
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
  $core->fs = new InlineRetainedFileStorage($temporary);
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
  // Keep the captured Phase 1/2 fixture intact; exercise Phase 3 on a clone.
  foreach (array('97dd2fde-fd7f-46e2-bb2d-7b686993880f' => 'alignLeft',
    '2200ad5e-671e-42e3-835b-93cbcc338fae' => 'alignRight') as $id => $style) {
    $attribute = 'data-papijo-inline-image-id="' . $id . '"';
    copyCheck(strpos($source->text, $attribute) !== false, 'Active fixture marker must exist');
    $source->text = str_replace($attribute, $attribute . ' data-papijo-inline-image-style="' . $style . '"', $source->text);
  }
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
      copyCheck(substr_count($child->text, 'data-papijo-inline-image-style=') === 2,
        'Both occurrence presentations must survive semantic save');
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
        copyCheck($secondChild->text === $source->text, 'Second child copy must preserve occurrence presentations');
        foreach (array_merge($secondChild->inlineImages, $secondChild->tooltipImages) as $entry) {
          copyCheck(strpos($entry->image->path, 'images/') === 0 && is_file($temporary . '/content/200/' . $entry->image->path),
            'Second PHP-backed child copy must own destination-local files');
        }
        echo "PHP SAVED COLUMN CHILD -> ACCORDION COPY/SAVE PASS\n";
      }
    }
  }
  copyCheck($framework->exports === 9, 'All PHP fixture exports must complete');
  // Replacement uses distinct real files and retains inactive A. Exercise the
  // old/new semantic file comparison, not only first-save localization.
  foreach (array('standalone', 'accordion', 'column', 'book') as $container) {
    $destination++;
    $oldChild = json_decode(json_encode($source));
    // A owns a distinct file and is the sole active inline definition initially.
    $oldChild->inlineImages = array(json_decode(json_encode($source->inlineImages[3])));
    $oldChild->text = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="' .
      $oldChild->inlineImages[0]->id . '" data-papijo-inline-image-style="alignLeft"></span></p>';
    foreach (array_merge($oldChild->inlineImages, $oldChild->tooltipImages) as $entry) {
      $entry->image->path = '../42/' . $entry->image->path;
    }
    $library = array('name' => 'H5P.AdvancedTextPapiJo', 'majorVersion' => 1, 'minorVersion' => 2);
    $editor->processParameters($destination, $library, $oldChild);
    $child = json_decode(json_encode($oldChild));
    $A = $child->inlineImages[0];
    $physicalB = $source->inlineImages[4];
    copyCheck($physicalB->image->path !== $A->image->path, 'Replacement requires distinct physical image fixture');
    $B = (object) array('id' => 'php-replacement-B', 'image' => json_decode(json_encode($physicalB->image)), 'alt' => 'Explicit replacement description');
    $B->image->path = '../42/' . $B->image->path;
    $child->inlineImages[] = $B;
    $child->text = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="php-replacement-B" data-papijo-inline-image-style="alignLeft"></span></p>';
    $beforeA = hash_file('sha256', $temporary . '/content/' . $destination . '/' . $A->image->path);
    $wrap = function ($text) use ($container) {
      $action = (object) array('library' => 'H5P.AdvancedTextPapiJo 1.2', 'params' => $text);
      if ($container === 'accordion') {
        return (object) array('panels' => array((object) array('title' => 'Replacement', 'content' => $action)));
      }
      $column = (object) array('content' => array((object) array('content' => $action)));
      if ($container === 'column') { return $column; }
      if ($container === 'book') {
        return (object) array('chapters' => array((object) array('library' => 'H5P.ColumnPapiJo 1.20', 'params' => $column)));
      }
      return $text;
    };
    if ($container === 'accordion') { $library = array('name' => 'H5P.AccordionPapiJo', 'majorVersion' => 1, 'minorVersion' => 1); }
    if ($container === 'column') { $library = array('name' => 'H5P.ColumnPapiJo', 'majorVersion' => 1, 'minorVersion' => 20); }
    if ($container === 'book') { $library = array('name' => 'H5P.InteractiveBookPapiJo', 'majorVersion' => 1, 'minorVersion' => 16); }
    $params = $wrap($child);
    $editor->processParameters($destination, $library, $params, $library, $wrap($oldChild));
    copyCheck($B->image->path === $physicalB->image->path, 'Replacement B must localize from foreign content');
    copyCheck($A == $oldChild->inlineImages[0] && $A->alt === $oldChild->inlineImages[0]->alt, 'Inactive A metadata must remain unchanged');
    copyCheck(hash_file('sha256', $temporary . '/content/' . $destination . '/' . $A->image->path) === $beforeA, 'Old physical file A must remain intact');
    copyCheck(is_file($temporary . '/content/' . $destination . '/' . $B->image->path), 'Replacement B file must exist');
    copyCheck(strpos($child->text, 'data-papijo-inline-image-id="' . $A->id . '"') === false, 'A must be inactive for retention test');
    $content = array('id' => $destination, 'slug' => 'replacement', 'title' => 'Replacement fixture',
      'library' => $library, 'embedType' => 'div', 'filtered' => json_encode($params), 'dependencies' => array(), 'metadata' => array());
    copyCheck($export->createExportFile($content), 'Replacement content export must succeed');
    $archive = new ZipArchive();
    copyCheck($archive->open($temporary . '/exports/replacement-' . $destination . '.h5p') === true, 'Replacement export must open');
    $extracted = $temporary . '/replacement-import-' . $destination;
    copyCheck($archive->extractTo($extracted), 'Replacement export must extract'); $archive->close();
    $core->fs->saveContent($extracted . '/content', array('id' => $destination + 300));
    copyCheck(json_decode(file_get_contents($temporary . '/content/' . ($destination + 300) . '/content.json')) == $params, 'Replacement reimport must preserve complete parameters');
    foreach (array($A, $B) as $entry) {
      copyCheck(hash_file('sha256', $temporary . '/content/' . ($destination + 300) . '/' . $entry->image->path) ===
        hash_file('sha256', $temporary . '/content/' . $destination . '/' . $entry->image->path), 'Both retained A/B files must survive export/reimport');
    }
    echo 'PHP REPLACEMENT OLD/NEW SAVE/LOCALIZE/RETAIN/EXPORT/REIMPORT PASS ' . $container . "\n";
  }
  copyCheck($framework->exports === 13, 'All original and replacement exports must complete');
  // Linked occurrences retain the same semantic file lifecycle. Actual storage
  // and H5PExport run only in this test's unique temporary tree.
  $linkValidator = new H5PContentValidator($framework, null);
  foreach (array('standalone', 'accordion', 'column', 'book') as $container) {
    $destination++;
    $child = json_decode(json_encode($source));
    $A = $child->inlineImages[3];
    $B = (object) array('id' => 'php-linked-replacement-B', 'image' => json_decode(json_encode($child->inlineImages[4]->image)), 'alt' => 'Replacement link purpose');
    $child->inlineImages[] = $B;
    $X = 'https://example.com/X?q=1&amp;b=2#details';
    $Y = 'http://example.com/Y';
    $child->text = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="' . $B->id .
      '" data-papijo-inline-image-style="alignLeft" data-papijo-inline-image-link="' . $X . '"></span>' .
      '<span class="papijo-inline-image" data-papijo-inline-image-id="' . $A->id .
      '" data-papijo-inline-image-style="alignRight" data-papijo-inline-image-link="' . $Y . '"></span>' .
      '<span class="papijo-inline-image" data-papijo-inline-image-id="' . $A->id . '"></span></p>';
    $linkedHtml = $child->text;
    $linkValidator->validateText($child->text, $core->loadLibrarySemantics('H5P.AdvancedTextPapiJo', 1, 2)[0]);
    copyCheck($child->text === $linkedHtml, 'PHP filtering must preserve occurrence links/query/fragment');
    foreach (array_merge($child->inlineImages, $child->tooltipImages) as $entry) {
      $entry->image->path = '../42/' . $entry->image->path;
    }
    $library = array('name' => 'H5P.AdvancedTextPapiJo', 'majorVersion' => 1, 'minorVersion' => 2);
    $action = (object) array('library' => 'H5P.AdvancedTextPapiJo 1.2', 'params' => $child, 'subContentId' => 'linked-child');
    $params = $child;
    if ($container === 'accordion') {
      $library = array('name' => 'H5P.AccordionPapiJo', 'majorVersion' => 1, 'minorVersion' => 1);
      $params = (object) array('panels' => array((object) array('title' => 'Linked child', 'content' => $action)));
    }
    if ($container === 'column' || $container === 'book') {
      $library = array('name' => 'H5P.ColumnPapiJo', 'majorVersion' => 1, 'minorVersion' => 20);
      $params = (object) array('content' => array((object) array('content' => $action)));
    }
    if ($container === 'book') {
      $library = array('name' => 'H5P.InteractiveBookPapiJo', 'majorVersion' => 1, 'minorVersion' => 16);
      $params = (object) array('chapters' => array((object) array('library' => 'H5P.ColumnPapiJo 1.20', 'params' => $params)));
    }
    $editor->processParameters($destination, $library, $params);
    $editor->processParameters($destination, $library, $params, $library, json_decode(json_encode($params)));
    copyCheck($child->text === $linkedHtml, 'Semantic save/re-save must preserve independent linked/unlinked occurrences');
    foreach (array_merge($child->inlineImages, $child->tooltipImages) as $entry) {
      copyCheck(array_keys(get_object_vars($entry)) === array('id', 'image', 'alt'), 'Link must not enter definitions');
      copyCheck(is_file($temporary . '/content/' . $destination . '/' . $entry->image->path), 'Linked destination must own its file');
    }
    $content = array('id' => $destination, 'slug' => 'image-link', 'title' => 'Linked fixture', 'library' => $library,
      'embedType' => 'div', 'filtered' => json_encode($params), 'dependencies' => array(), 'metadata' => array());
    copyCheck($export->createExportFile($content), 'Actual linked content export must succeed');
    $archive = new ZipArchive();
    copyCheck($archive->open($temporary . '/exports/image-link-' . $destination . '.h5p') === true, 'Actual linked export must open');
    $extracted = $temporary . '/link-import-' . $destination;
    copyCheck($archive->extractTo($extracted), 'Linked export must extract'); $archive->close();
    $core->fs->saveContent($extracted . '/content', array('id' => $destination + 500));
    copyCheck(json_decode(file_get_contents($temporary . '/content/' . ($destination + 500) . '/content.json')) == $params,
      'Actual reimport preserves all linked parameters');
    foreach (array_merge($child->inlineImages, $child->tooltipImages) as $entry) {
      copyCheck(hash_file('sha256', $temporary . '/content/' . ($destination + 500) . '/' . $entry->image->path) ===
        hash_file('sha256', $temporary . '/content/' . $destination . '/' . $entry->image->path), 'Retained linked/unlinked file bytes survive reimport');
    }
    echo 'PHP IMAGE LINK FILTER/SAVE/RETAIN/EXPORT/REIMPORT PASS ' . $container . "\n";
  }
  copyCheck($framework->exports === 17, 'Original/replacement/link content exports must complete');
}
finally {
  // Only this test's unique temporary tree; never a site/content/library directory.
  $resolved = realpath($temporary);
  $tempRoot = realpath(sys_get_temp_dir());
  copyCheck($resolved !== false && dirname($resolved) === $tempRoot && strpos(basename($resolved), 'papijo-inline-copy-') === 0, 'Unsafe cleanup target');
  H5PCore::deleteFileTree($resolved);
}
