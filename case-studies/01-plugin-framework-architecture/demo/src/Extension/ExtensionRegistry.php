<?php

declare(strict_types=1);

namespace App\Extension;

use App\Service\PluginDatabase;

final class ExtensionRegistry
{
    public function __construct(private readonly PluginDatabase $database)
    {
    }

    /** @return list<array<string, string|int>> */
    public function all(): array
    {
        return array_map(
            static fn (array $plugin): array => [
                'name' => $plugin['name'],
                'label' => $plugin['label'],
                'navigationLabel' => $plugin['navigation_label'],
                'routePath' => $plugin['route_path'],
                'apiBasePath' => $plugin['api_base_path'],
                'remoteEntry' => $plugin['remote_entry'],
                'exposedModule' => $plugin['exposed_module'],
            ],
            $this->database->enabledPlugins()
        );
    }
}
