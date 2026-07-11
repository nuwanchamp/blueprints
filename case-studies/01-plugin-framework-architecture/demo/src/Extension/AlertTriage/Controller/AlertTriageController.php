<?php

declare(strict_types=1);

namespace App\Extension\AlertTriage\Controller;

use App\Extension\AlertTriage\Service\AlertTriageSummary;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class AlertTriageController extends AbstractController
{
    #[Route('/api/extensions/alert-triage/summary', name: 'api_extension_alert_triage_summary', methods: ['GET'])]
    public function summary(AlertTriageSummary $summary): JsonResponse
    {
        return $this->json($summary->snapshot());
    }
}
