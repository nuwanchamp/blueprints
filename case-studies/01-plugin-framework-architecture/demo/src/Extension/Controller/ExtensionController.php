<?php

declare(strict_types=1);

namespace App\Extension\Controller;

use App\Extension\ExtensionRegistry;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class ExtensionController extends AbstractController
{
    #[Route('/api/extensions', name: 'api_extensions', methods: ['GET'])]
    public function extensions(ExtensionRegistry $registry): JsonResponse
    {
        return $this->json([
            'extensions' => $registry->all(),
        ]);
    }
}
