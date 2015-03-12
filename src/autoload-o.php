<?php

spl_autoload_register(function ($class) {
    $autoload = include('../autoload.php');
    foreach ($autoload as $ns => $loader) {
        if ($class === $ns || strpos($class, $ns.'\\') === 0) {
            $file = $loader.DIRECTORY_SEPARATOR.preg_replace('/\\\/', '/', substr($class, strlen($ns) + 1)).'.php';
            if (stream_resolve_include_path($file)) {
                require $file;
            }
        }
    }
});
