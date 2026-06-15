<?php
/**
 * STU-Check Settings API
 * 
 * GET  ?key=xxx — ดึงค่า setting
 * POST { key, value } — บันทึกค่า setting
 */

require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = getAuthUser($pdo);

if ($method === 'GET') {
    $key = $_GET['key'] ?? '';
    
    if ($key) {
        $stmt = $pdo->prepare("SELECT value FROM settings WHERE user_id = ? AND key = ?");
        $stmt->execute([$user['id'], $key]);
        $row = $stmt->fetch();
        respond([
            'success' => true,
            'key' => $key,
            'value' => $row ? $row['value'] : null
        ]);
    } else {
        // Return all settings for this user
        $stmt = $pdo->prepare("SELECT key, value FROM settings WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['key']] = $row['value'];
        }
        respond([
            'success' => true,
            'settings' => $settings
        ]);
    }
    
} elseif ($method === 'POST') {
    $body = getJsonBody();
    $key = $body['key'] ?? '';
    $value = $body['value'] ?? '';
    
    if (!$key) {
        respond(['success' => false, 'error' => 'Missing key'], 400);
    }
    
    // UPSERT: insert or update
    $stmt = $pdo->prepare("
        INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
        ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
    ");
    $stmt->execute([$user['id'], $key, $value]);
    
    respond(['success' => true, 'message' => 'บันทึกการตั้งค่าสำเร็จ']);
    
} else {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}
