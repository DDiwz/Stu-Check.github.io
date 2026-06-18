<?php
/**
 * STU-Check Profile API
 * 
 * GET  — ดึงข้อมูลโปรไฟล์ (requires auth)
 * POST — บันทึกโปรไฟล์ { displayName, uid, avatar } (requires auth)
 */

require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = getAuthUser($pdo);

if ($method === 'GET') {
    respond([
        'success' => true,
        'profile' => [
            'username' => $user['username'],
            'displayName' => $user['display_name'],
            'uid' => $user['uid'],
            'avatar' => $user['avatar']
        ]
    ]);
} elseif ($method === 'POST') {
    $body = getJsonBody();
    
    $displayName = $body['displayName'] ?? $user['display_name'];
    $uid = $body['uid'] ?? $user['uid'];
    $avatar = $body['avatar'] ?? $user['avatar'];
    
    $stmt = $pdo->prepare("UPDATE users SET display_name = ?, uid = ?, avatar = ? WHERE id = ?");
    $stmt->execute([$displayName, $uid, $avatar, $user['id']]);
    
    respond([
        'success' => true,
        'message' => 'บันทึกโปรไฟล์สำเร็จ',
        'profile' => [
            'username' => $user['username'],
            'displayName' => $displayName,
            'uid' => $uid,
            'avatar' => $avatar
        ]
    ]);
} else {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}
