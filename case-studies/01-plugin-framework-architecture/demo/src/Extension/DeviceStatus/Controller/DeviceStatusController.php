<?php

declare(strict_types=1);

namespace App\Extension\DeviceStatus\Controller;

use App\Extension\DeviceStatus\Service\DeviceStatusSummary;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class DeviceStatusController extends AbstractController
{
    #[Route('/api/extensions/device-status/summary', name: 'api_extension_device_status_summary', methods: ['GET'])]
    public function summary(DeviceStatusSummary $summary): JsonResponse
    {
        return $this->json($summary->snapshot());
    }
}
