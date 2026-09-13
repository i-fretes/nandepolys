#!/bin/bash
# Uso: e2e/server.sh start|stop  — levanta/detiene el servidor compilado para pruebas
PIDFILE=/tmp/nandepoly-server.pid
LOG=${LOG:-/tmp/nandepoly-server.log}
case "$1" in
  start)
    [ -f $PIDFILE ] && kill $(cat $PIDFILE) 2>/dev/null; sleep 0.3
    PORT=${PORT:-8080} setsid nohup node apps/server/dist/index.js > $LOG 2>&1 < /dev/null &
    echo $! > $PIDFILE; sleep 1.5; curl -s localhost:${PORT:-8080}/api/health; echo ;;
  stop) [ -f $PIDFILE ] && kill $(cat $PIDFILE) 2>/dev/null; rm -f $PIDFILE ;;
esac
