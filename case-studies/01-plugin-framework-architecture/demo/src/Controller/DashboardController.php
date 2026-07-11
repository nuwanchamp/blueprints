<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\MonitoringDashboard;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class DashboardController extends AbstractController
{
    #[Route('/api/dashboard', name: 'api_dashboard', methods: ['GET'])]
    public function dashboard(MonitoringDashboard $dashboard): JsonResponse
    {
        return $this->json($dashboard->snapshot());
    }
}
