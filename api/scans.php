<?php
/**
 * STU-Check Scans API
 * 
 * POST — บันทึกผลสแกน { sessionId, round, timeSec, faces, positive, negative, neutral }
 * GET  ?session=xxx — ดึงข้อมูลสแกนทั้ง session
 * GET  (no params) — ดึงข้อมูลสแกนล่าสุด 50 รายการ
 */

require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = getAuthUser($pdo);

if ($method === 'POST') {
    $body = getJsonBody();
    
    $sessionId = $body['sessionId'] ?? '';
    $round = intval($body['round'] ?? 0);
    $timeSec = intval($body['timeSec'] ?? 0);
    $faces = intval($body['faces'] ?? 0);
    $positive = intval($body['positive'] ?? 0);
    $negative = intval($body['negative'] ?? 0);
    $neutral = intval($body['neutral'] ?? 0);
    
    if (!$sessionId) {
        respond(['success' => false, 'error' => 'Missing sessionId'], 400);
    }
    
    $stmt = $pdo->prepare("
        INSERT INTO scans (user_id, session_id, round, time_sec, faces, positive, negative, neutral)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$user['id'], $sessionId, $round, $timeSec, $faces, $positive, $negative, $neutral]);
    
    respond([
        'success' => true,
        'id' => $pdo->lastInsertId(),
        'message' => 'บันทึกผลสแกนสำเร็จ'
    ]);
    
} elseif ($method === 'GET') {
    $sessionId = $_GET['session'] ?? '';
    
    if ($sessionId) {
        $stmt = $pdo->prepare("
            SELECT round, time_sec as timeSec, faces, positive, negative, neutral, created_at
            FROM scans WHERE user_id = ? AND session_id = ? ORDER BY round ASC
        ");
        $stmt->execute([$user['id'], $sessionId]);
    } else {
        $stmt = $pdo->prepare("
            SELECT session_id as sessionId, round, time_sec as timeSec, faces, positive, negative, neutral, created_at
            FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
        ");
        $stmt->execute([$user['id']]);
    }
    
    respond([
        'success' => true,
        'scans' => $stmt->fetchAll()
    ]);
    
} else {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}
