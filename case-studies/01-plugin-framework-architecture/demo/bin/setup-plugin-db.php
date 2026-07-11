#!/usr/bin/env php
<?php

declare(strict_types=1);

use App\Service\PluginDatabase;

require dirname(__DIR__) . '/vendor/autoload.php';

$database = new PluginDatabase();
$pluginRoot = dirname(__DIR__) . '/frontend/plugins';

$manifestPaths = glob($pluginRoot . '/*/manifest.json') ?: [];
$registeredNames = [];

foreach ($manifestPaths as $manifestPath) {
    $manifest = json_decode(
        file_get_contents($manifestPath) ?: '',
        true,
        512,
        JSON_THROW_ON_ERROR
    );
    $registeredNames[] = $manifest['name'];

    $database->upsertPlugin([
        'name' => $manifest['name'],
        'label' => $manifest['label'],
        'navigation_label' => $manifest['navigationLabel'],
        'route_path' => $manifest['routePath'],
        'api_base_path' => $manifest['apiBasePath'],
        'remote_entry' => $manifest['remoteEntry'],
        'exposed_module' => $manifest['exposedModule'],
        'enabled' => ($manifest['enabled'] ?? true) ? 1 : 0,
    ]);
}

if ($registeredNames !== []) {
    $placeholders = implode(', ', array_fill(0, count($registeredNames), '?'));
    $statement = $database->connection()->prepare(
        sprintf('UPDATE plugins SET enabled = 0 WHERE name NOT IN (%s)', $placeholders)
    );
    $statement->execute($registeredNames);
}

echo "Plugin database seeded: var/data/plugins.sqlite\n";
