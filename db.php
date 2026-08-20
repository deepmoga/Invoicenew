<?php
// cPanel MySQL Database Connection Configuration
$host = getenv('DB_HOST') ?: 'localhost';
$dbname = getenv('DB_NAME') ?: 'exopfnhh_invoice'; 
$username = getenv('DB_USER') ?: 'exopfnhh_invoice';
$password = getenv('DB_PASS') ?: 'Official@12345';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'MySQL database connection failed: ' . $e->getMessage()]);
    exit;
}
