<?php

declare(strict_types=1);

namespace App\Extension\DeviceStatus\Service;

use App\Service\MonitoringDashboard;

final class DeviceStatusSummary
{
    public function __construct(private readonly MonitoringDashboard $dashboard)
    {
    }

    /** @return array<string, mixed> */
    public function snapshot(): array
    {
        $snapshot = $this->dashboard->snapshot();
        $timeline = $snapshot['timeline'];
        $devices = $snapshot['devices'];

        $criticalEvents = 0;
        $serviceEvents = [];

        foreach ($timeline as $entry) {
            foreach ($entry['events'] as $event) {
                $serviceEvents[$event['source']] = ($serviceEvents[$event['source']] ?? 0) + 1;

                if ($event['severity'] === 'critical') {
                    $criticalEvents++;
                }
            }
        }

        return [
            'extension' => 'device-status',
            'source' => 'integrated-symfony-backend',
            'coreServicesUsed' => ['App\\Service\\MonitoringDashboard'],
            'coreEvents' => array_sum($serviceEvents),
            'downDevices' => count(array_filter($devices, static fn (array $device): bool => !$device['reachable'])),
            'criticalAlerts' => $criticalEvents,
            'serviceEvents' => $serviceEvents,
        ];
    }
}
