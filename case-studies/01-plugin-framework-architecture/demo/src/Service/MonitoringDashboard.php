<?php

declare(strict_types=1);

namespace App\Service;

final class MonitoringDashboard
{
    /** @return array<string, mixed> */
    public function snapshot(): array
    {
        $devices = [
            ['name' => 'phone-104', 'reachable' => true],
            ['name' => 'phone-217', 'reachable' => false],
            ['name' => 'phone-309', 'reachable' => true],
        ];

        $timeline = [];

        foreach ($devices as $device) {
            $timeline[] = [
                'event' => 'device.checked',
                'device' => $device['name'],
                'status' => $device['reachable'] ? 'up' : 'down',
                'events' => $this->eventsFor($device),
            ];
        }

        return [
            'services' => ['device-health', 'alert-router'],
            'frontendPlugins' => ['device-status', 'alert-triage'],
            'devices' => $devices,
            'summary' => [
                'healthy' => count(array_filter($devices, static fn (array $device): bool => $device['reachable'])),
                'unreachable' => count(array_filter($devices, static fn (array $device): bool => !$device['reachable'])),
            ],
            'timeline' => $timeline,
        ];
    }

    /**
     * @param array{name: string, reachable: bool} $device
     * @return list<array{source: string, severity: string, message: string}>
     */
    private function eventsFor(array $device): array
    {
        $status = $device['reachable'] ? 'up' : 'down';
        $events = [
            [
                'source' => 'device-health',
                'severity' => $device['reachable'] ? 'info' : 'warning',
                'message' => sprintf('%s reported %s', $device['name'], strtoupper($status)),
            ],
        ];

        if (!$device['reachable']) {
            $events[] = [
                'source' => 'alert-router',
                'severity' => 'critical',
                'message' => sprintf('Alert routed for %s', $device['name']),
            ];
        }

        return $events;
    }
}
