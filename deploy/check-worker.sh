#!/bin/bash
# Verificación post-deploy — se llama a mano o desde deploy_main.sh:
#
#   bash deploy/check-worker.sh
#
# Vive aparte de deploy_main.sh A PROPÓSITO: ese script está modificado
# localmente en el VPS (rutas, credenciales), así que cualquier cambio nuestro
# ahí bloquea el `git pull` del propio deploy. Este archivo es nuevo y nunca
# colisiona.

CONTAINER_NAME="${CONTAINER_NAME:-jac-showroom}"
WORKER_CONTAINER_NAME="${WORKER_CONTAINER_NAME:-jac-showroom-worker}"

# Nombre EXACTO: `docker ps | grep jac-showroom` también casa con
# jac-showroom-worker, así que la web puede estar caída y el chequeo dar por
# bueno el deploy solo porque el worker sigue en pie.
running() {
    [ -n "$(docker ps --filter "name=^${1}$" --format '{{.Names}}')" ]
}

status=0

if running "$CONTAINER_NAME"; then
    echo "[OK] $CONTAINER_NAME corriendo"
else
    echo "[ERROR] $CONTAINER_NAME NO esta corriendo"
    docker logs --tail=50 "$CONTAINER_NAME" 2>/dev/null || echo "(el contenedor no existe)"
    status=1
fi

# El worker es un servicio APARTE (target: worker). Si no esta arriba, la web
# funciona pero los ZIP de 360 se quedan en QUEUED para siempre y nadie se
# entera hasta que alguien mira el panel. Es EL fallo silencioso de este
# sistema, por eso se comprueba explicitamente.
if running "$WORKER_CONTAINER_NAME"; then
    echo "[OK] $WORKER_CONTAINER_NAME corriendo"
    docker logs --tail=10 "$WORKER_CONTAINER_NAME" 2>/dev/null
    echo "[INFO] Debe decir: Worker de assets arriba - cola \"color-zip\", concurrencia 1."
else
    echo "[WARN] $WORKER_CONTAINER_NAME NO esta corriendo."
    echo "[WARN] Las subidas de ZIP 360 se quedaran encoladas sin procesar."
    docker logs --tail=30 "$WORKER_CONTAINER_NAME" 2>/dev/null || echo "(el contenedor no existe)"
    status=1
fi

exit $status
