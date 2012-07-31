<?php

### CONFIG HOST
$host = "127.0.0.1";
####

header('Cache-Control: no-cache, must-revalidate');
header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
header('Content-type: application/json');

$gestor = popen('/usr/bin/squidclient -h ' . $host . ' cache_object://' . $host . '/info 2>&1', 'r');
$data = fread($gestor, 2096);

$return_data = array();

foreach (split("\n", $data) as $line) {

        if (strpos($line, "Number of clients accessing cache:") !== false) {
                ereg("[ \t]*Number of clients accessing cache:[ \t]*([0-9]*)", $line, $regs);
                if (count($regs) > 1 && !empty($regs[1])) {
                        $return_data["clients"] = $regs[1];
                }
        } else if (strpos($line, "CPU Usage, 5 minute avg:") !== false) {
                ereg("[ \t]*CPU Usage, 5 minute avg:[ \t]*([0-9\.]*)", $line, $regs);
                if (count($regs) > 1 && !empty($regs[1])) {
                        $return_data["cpu_usage"] = $regs[1];
                }
        } else if (strpos($line, "Average HTTP requests per minute since start:") !== false) {
                ereg("[ \t]*Average HTTP requests per minute since start:[ \t]*([0-9]*)", $line, $regs);
                if (count($regs) > 1 && !empty($regs[1])) {
                        $return_data["http_requests"] = $regs[1];
                }
        }
}

echo json_encode($return_data);
?>
