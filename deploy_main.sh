#!/bin/bash

# Configuración
PROJECT_PATH="/home/bel/Showroom/src/jac-vzla-showroom360"
SECRETS_PATH="/home/bel/Showroom/src/secrets/github_token.txt"
GITHUB_ACCESS_TOKEN=$(cat "$SECRETS_PATH" | tr -d '\n\r' | xargs)
GITHUB_USER="Corporacion-bel"
GITHUB_REPO="jac-vzla-showroom360"
COMPOSE_FILE="docker-compose.yml"
CONTAINER_NAME="jac-showroom"
IMAGE_NAME="jac-showroom:latest"
CLAVE_SSH_NAME="github-deploy-showroom"
ENV_PATH="$PROJECT_PATH/environments/.env"

echo "[INFO] =========================================="
echo "[INFO] Iniciando despliegue de backend livestock-farming"
echo "[INFO] Fecha: $(date)"
echo "[INFO] =========================================="

echo "[INFO] Listando claves SSH disponibles..."
ls -la ~/.ssh/

echo "[INFO] Iniciando agente SSH..."
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/$CLAVE_SSH_NAME
if [ $? -ne 0 ]; then
    echo "[ERROR] No se pudo cargar la clave SSH. Abortando deploy."
    exit 1
fi

echo "[INFO] Ejecutado desde: $(pwd)"
echo "[INFO] Trabajando en: $PROJECT_PATH"
cd "$PROJECT_PATH" || exit 1
echo "[OK] En carpeta: $(pwd)"

# git config --global --add safe.directory "$PROJECT_PATH"
echo "[0/4] Pulling ultimos cambios..."
git pull https://$GITHUB_ACCESS_TOKEN@github.com/$GITHUB_USER/$GITHUB_REPO.git staging
if [ $? -ne 0 ]; then
    echo "[ERROR] git pull falló (revisa permisos SSH, conflictos de merge o cambios locales sin commitear). Abortando deploy."
    exit 1
fi
echo "[OK] Commit: $(git log -1 --oneline)"

# Verificar archivos necesarios
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "[ERROR] No existe $COMPOSE_FILE"
    exit 1
fi

# Verificar si existe .env en la carpeta secrets
if [ -f "$ENV_PATH" ]; then
    echo "[INFO] Archivo .env encontrado en $ENV_PATH"
    ENV_FILE="--env-file $ENV_PATH"

    # Mostrar variables de entorno (ocultando valores sensibles)
    echo "[INFO] Variables de entorno cargadas:"
    grep -E "^(POSTGRES_|DATABASE_|DB_|NODE_|PORT|JWT_)" "$ENV_PATH" | cut -d'=' -f1 | sed 's/.*/  - &/'
else
    echo "[ERROR] No se encontró archivo .env en $ENV_PATH"
    echo "[ERROR] El despliegue no puede continuar sin variables de entorno"
    exit 1
fi

echo "[1/4] Deteniendo y eliminando contenedor actual..."
if docker ps -a | grep -q $CONTAINER_NAME; then
    echo "[INFO] Deteniendo contenedor $CONTAINER_NAME..."
    docker stop $CONTAINER_NAME 2>/dev/null
    docker rm $CONTAINER_NAME 2>/dev/null
    echo "[OK] Contenedor eliminado"
else
    echo "[INFO] No existia contenedor previo"
fi

echo "[2/4] Reconstruyendo imagen..."
docker compose -f $COMPOSE_FILE $ENV_FILE build --no-cache
if [ $? -ne 0 ]; then
    echo "[ERROR] El build de la imagen falló. Abortando deploy."
    exit 1
fi

echo "[3/4] Levantando nuevo contenedor..."
docker compose -f $COMPOSE_FILE $ENV_FILE up -d
if [ $? -ne 0 ]; then
    echo "[ERROR] docker compose up falló. Abortando deploy."
    exit 1
fi

echo "[4/4] Verificando estado..."
sleep 5

# Verificar si el contenedor está corriendo
if docker ps | grep -q $CONTAINER_NAME; then
    echo "[OK] DESPLIEGUE EXITOSO"
    echo ""
    echo "[INFO] Informacion del contenedor:"
    docker ps | grep $CONTAINER_NAME
    echo ""
    echo "[INFO] Ultimos logs:"
    docker logs --tail=20 $CONTAINER_NAME 2>/dev/null || echo "Esperando logs..."
    echo ""
    echo "[INFO] Contenedor disponible en puerto 5522"
    echo "[INFO] Para ver mas logs: docker logs -f $CONTAINER_NAME"
    exit 0
else
    echo "[ERROR] El contenedor no esta corriendo"
    echo ""
    echo "[INFO] Logs del contenedor fallido:"
    docker logs --tail=50 $CONTAINER_NAME 2>/dev/null || echo "No hay logs disponibles"
    echo ""
    echo "[INFO] Intentando recuperar..."
    docker compose -f $COMPOSE_FILE $ENV_FILE logs
    exit 1
fi
