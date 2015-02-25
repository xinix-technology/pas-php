<?php

$autoload = json_decode(file_get_contents('../autoload.json'), 1);

spl_autoload_register(function ($class) use ($autoload) {
    foreach ($autoload as $ns => $loader) {
        if (strpos($class, $ns.'\\') === 0) {
            $file = '..'
                . DIRECTORY_SEPARATOR
                . $loader
                . DIRECTORY_SEPARATOR
                . preg_replace('/\\\/', '/', substr($class, strlen($ns) + 1))
                . '.php';

            if (stream_resolve_include_path($file)) {
                require $file;
            }
        }
    }
});
