<?php
/**
 * STU-Check Database Connection
 * ใช้ PDO + SQLite สำหรับรันในเครื่อง
 * เมื่อย้ายไป Server จริง แค่เปลี่ยน DSN เป็น MySQL
 * 
 * === ย้ายไป MySQL ===
 * เปลี่ยนบรรทัด $pdo = new PDO(...) เป็น:
 * $pdo = new PDO("mysql:host=localhost;dbname=stucheck;charset=utf8mb4", "user", "password");
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

try {
    $pdo = new PDO("sqlite:" . $dataDir . "/stucheck.db");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    // Enable WAL mode for better concurrent access
    $pdo->exec("PRAGMA journal_mode=WAL");
    
    // Create tables if not exist
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT DEFAULT '',
            uid TEXT DEFAULT '',
            avatar TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            round INTEGER NOT NULL,
            time_sec INTEGER NOT NULL,
            faces INTEGER DEFAULT 0,
            positive INTEGER DEFAULT 0,
            negative INTEGER DEFAULT 0,
            neutral INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            value TEXT DEFAULT '',
            UNIQUE(user_id, key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// Helper: get JSON body
function getJsonBody() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

// Helper: respond JSON
function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Helper: simple session token (username based for simplicity)
function getAuthUser($pdo) {
    $token = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $token = str_replace('Bearer ', '', $token);
    if (!$token) {
        respond(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) {
        respond(['success' => false, 'error' => 'User not found'], 401);
    }
    return $user;
}
