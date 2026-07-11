<?php

declare(strict_types=1);

namespace App\Extension\AlertTriage\Service;

use App\Service\MonitoringDashboard;

final class AlertTriageSummary
{
    public function __construct(private readonly MonitoringDashboard $dashboard)
    {
    }

    /** @return array<string, mixed> */
    public function snapshot(): array
    {
        $snapshot = $this->dashboard->snapshot();
        $eventsBySeverity = [
            'critical' => 0,
            'warning' => 0,
            'info' => 0,
        ];
        $actions = [];

        foreach ($snapshot['timeline'] as $entry) {
            foreach ($entry['events'] as $event) {
                $severity = $event['severity'];
                $eventsBySeverity[$severity] = ($eventsBySeverity[$severity] ?? 0) + 1;

                if ($severity === 'critical') {
                    $actions[] = [
                        'device' => $entry['device'],
                        'owner' => $event['source'],
                        'action' => sprintf('Escalate %s outage to on-call support', $entry['device']),
                    ];
                }
            }
        }

        return [
            'extension' => 'alert-triage',
            'source' => 'integrated-symfony-backend',
            'coreServicesUsed' => ['App\\Service\\MonitoringDashboard'],
            'eventsBySeverity' => $eventsBySeverity,
            'openActions' => $actions,
            'highestPriority' => $eventsBySeverity['critical'] > 0 ? 'critical' : 'normal',
        ];
    }
}
