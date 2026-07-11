<?php

declare(strict_types=1);

namespace App\Service;

use PDO;

final class PluginDatabase
{
    public function connection(): PDO
    {
        $path = dirname(__DIR__, 2) . '/var/data/plugins.sqlite';
        $directory = dirname($path);

        if (!is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        $pdo = new PDO('sqlite:' . $path);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        return $pdo;
    }

    public function migrate(): void
    {
        $pdo = $this->connection();

        $pdo->exec(
            <<<'SQL'
            CREATE TABLE IF NOT EXISTS plugins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                navigation_label TEXT NOT NULL,
                route_path TEXT NOT NULL,
                api_base_path TEXT NOT NULL,
                remote_entry TEXT NOT NULL,
                exposed_module TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            )
            SQL
        );

        $columns = $pdo->query('PRAGMA table_info(plugins)')->fetchAll();
        $columnNames = array_map(static fn (array $column): string => $column['name'], $columns);

        if (in_array('summary_path', $columnNames, true) || !in_array('api_base_path', $columnNames, true)) {
            $pdo->exec('DROP TABLE IF EXISTS plugins_next');

            $pdo->exec(
                <<<'SQL'
                CREATE TABLE plugins_next (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    navigation_label TEXT NOT NULL,
                    route_path TEXT NOT NULL,
                    api_base_path TEXT NOT NULL,
                    remote_entry TEXT NOT NULL,
                    exposed_module TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1
                )
                SQL
            );

            $apiBaseExpression = in_array('api_base_path', $columnNames, true)
                ? 'api_base_path'
                : "replace(summary_path, '/summary', '')";

            $pdo->exec(
                <<<SQL
                INSERT INTO plugins_next (
                    id,
                    name,
                    label,
                    navigation_label,
                    route_path,
                    api_base_path,
                    remote_entry,
                    exposed_module,
                    enabled
                )
                SELECT
                    id,
                    name,
                    label,
                    navigation_label,
                    route_path,
                    {$apiBaseExpression},
                    remote_entry,
                    exposed_module,
                    enabled
                FROM plugins
                SQL
            );

            $pdo->exec('DROP TABLE plugins');
            $pdo->exec('ALTER TABLE plugins_next RENAME TO plugins');
        }
    }

    /**
     * @param array<string, string|int> $plugin
     */
    public function upsertPlugin(array $plugin): void
    {
        $this->migrate();

        $statement = $this->connection()->prepare(
            <<<'SQL'
            INSERT INTO plugins (
                name,
                label,
                navigation_label,
                route_path,
                api_base_path,
                remote_entry,
                exposed_module,
                enabled
            ) VALUES (
                :name,
                :label,
                :navigation_label,
                :route_path,
                :api_base_path,
                :remote_entry,
                :exposed_module,
                :enabled
            )
            ON CONFLICT(name) DO UPDATE SET
                label = excluded.label,
                navigation_label = excluded.navigation_label,
                route_path = excluded.route_path,
                api_base_path = excluded.api_base_path,
                remote_entry = excluded.remote_entry,
                exposed_module = excluded.exposed_module,
                enabled = excluded.enabled
            SQL
        );

        $statement->execute($plugin);
    }

    /** @return list<array<string, string|int>> */
    public function enabledPlugins(): array
    {
        $this->migrate();

        $statement = $this->connection()->query(
            <<<'SQL'
            SELECT
                name,
                label,
                navigation_label,
                route_path,
                api_base_path,
                remote_entry,
                exposed_module,
                enabled
            FROM plugins
            WHERE enabled = 1
            ORDER BY navigation_label ASC
            SQL
        );

        return $statement->fetchAll();
    }
}
