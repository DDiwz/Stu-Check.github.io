<?php
/**
 * STU-Check Authentication API
 * 
 * POST ?action=register  { username, password }
 * POST ?action=login     { username, password }
 * POST ?action=delete    (requires auth header)
 */

require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body = getJsonBody();

switch ($action) {
    case 'register':
        handleRegister($pdo, $body);
        break;
    case 'login':
        handleLogin($pdo, $body);
        break;
    case 'delete':
        handleDelete($pdo);
        break;
    default:
        respond(['success' => false, 'error' => 'Invalid action'], 400);
}

function handleRegister($pdo, $body) {
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    
    if (strlen($username) < 3) {
        respond(['success' => false, 'error' => 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'], 400);
    }
    if (strlen($password) < 4) {
        respond(['success' => false, 'error' => 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'], 400);
    }
    
    // Check if username exists
    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        respond(['success' => false, 'error' => 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว'], 409);
    }
    
    // Hash password with bcrypt (secure, works on both SQLite and MySQL)
    $hash = password_hash($password, PASSWORD_BCRYPT);
    
    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)");
    $stmt->execute([$username, $hash, $username]);
    
    respond(['success' => true, 'message' => 'สมัครสมาชิกสำเร็จ']);
}

function handleLogin($pdo, $body) {
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    
    if (!$username || !$password) {
        respond(['success' => false, 'error' => 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'], 400);
    }
    
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    
    if (!$user || !password_verify($password, $user['password_hash'])) {
        respond(['success' => false, 'error' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'], 401);
    }
    
    // Return user info (token = username for simplicity, upgrade to JWT later)
    respond([
        'success' => true,
        'token' => $user['username'],
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'displayName' => $user['display_name'],
            'uid' => $user['uid'],
            'avatar' => $user['avatar']
        ]
    ]);
}

function handleDelete($pdo) {
    $user = getAuthUser($pdo);
    
    // Delete user and all related data (CASCADE)
    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    
    respond(['success' => true, 'message' => 'ลบบัญชีสำเร็จ']);
}
