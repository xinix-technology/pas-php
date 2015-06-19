<?php

$autoload = json_decode(file_get_contents('../autoload.json'), 1);

foreach($autoload['files'] as $al) {
    require "../$al";
}

$cwd = getcwd();

spl_autoload_register(function ($class) use ($autoload, $cwd) {
    foreach ($autoload as $ns => $loader) {
        if ($class === $ns || strpos($class, $ns.'\\') === 0) {

            $fileSuffix = '';
            if ($class !== $ns) {
                $fileSuffix = DIRECTORY_SEPARATOR . preg_replace('/\\\/', '/', substr($class, strlen($ns) + 1));
            }


            $file = $cwd
                . DIRECTORY_SEPARATOR
                . '..'
                . DIRECTORY_SEPARATOR
                . $loader
                . $fileSuffix
                . '.php';

            if (stream_resolve_include_path($file)) {
                require $file;
            }
        }
    }
});
