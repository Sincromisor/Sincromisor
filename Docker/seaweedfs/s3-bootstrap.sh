#!/bin/sh

echo "[bootstrap] starting s3-bootstrap.sh"

# set -euo pipefail

FILER_ENDPOINT="seaweed-filer:8888"
MASTER_ENDPOINT="seaweed-master:9333"

USER="${S3_USER}"
AK="${S3_ACCESS_KEY}"
SK="${S3_SECRET_KEY}"
ACTIONS="${S3_ACTIONS}"
ALLOW_ROTATE="${ALLOW_SECRET_ROTATION}"

weed_shell() {
	weed shell -master="${MASTER_ENDPOINT}" -filer="${FILER_ENDPOINT}"
}

echo "[bootstrap] start"
echo "[bootstrap] user=${USER} access_key=${AK}"
echo "[bootstrap] buckets=${S3_BUCKETS}"

# ------------------------------------------------------------
# 1) Ensure buckets (idempotent)
# ------------------------------------------------------------
echo "[bootstrap] ensuring buckets..."

EXISTING_BUCKETS="$(printf '%s\n' 's3.bucket.list' | weed_shell || true)"

for BUCKET in $(echo ${S3_BUCKETS} | tr ',' '\n'); do
    BUCKET=$(printf '%s' "$BUCKET" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
	if echo "${EXISTING_BUCKETS}" | grep -qE "(^|[[:space:]\"])${BUCKET}([[:space:]\"]|$)"; then
		echo "[bootstrap] bucket exists: ${BUCKET}"
	else
		echo "[bootstrap] creating bucket: ${BUCKET}"
		printf 's3.bucket.create -name %s\n' "${BUCKET}" | weed_shell || true
	fi
done

# ------------------------------------------------------------
# 2) Ensure credential & policy (safe idempotent)
# ------------------------------------------------------------
echo "[bootstrap] fetching current s3 configuration..."
CONF="$(printf '%s\n' 's3.configure' | weed_shell || true)"

HAS_AK="0"
echo "${CONF}" | grep -q "\"accessKey\"[[:space:]]*:[[:space:]]*\"${AK}\"" && HAS_AK="1"

if [ "${HAS_AK}" = "0" ]; then
	echo "[bootstrap] access_key not found -> applying initial config"
	printf 's3.configure -user=%s -access_key=%s -secret_key=%s -buckets=%s -actions=%s -apply\n' \
		"${USER}" "${AK}" "${SK}" "${S3_BUCKETS}" "${ACTIONS}" |
		weed_shell
	echo "[bootstrap] done (new credential created)"
	exit 0
fi

HAS_MATCHING_PAIR="0"
echo "${CONF}" | grep -q "\"accessKey\"[[:space:]]*:[[:space:]]*\"${AK}\"" &&
	echo "${CONF}" | grep -q "\"secretKey\"[[:space:]]*:[[:space:]]*\"${SK}\"" &&
	HAS_MATCHING_PAIR="1"

if [ "${HAS_MATCHING_PAIR}" = "1" ]; then
	echo "[bootstrap] credential exists and matches -> re-applying policy"
	printf 's3.configure -user=%s -access_key=%s -secret_key=%s -buckets=%s -actions=%s -apply\n' \
		"${USER}" "${AK}" "${SK}" "${S3_BUCKETS}" "${ACTIONS}" |
		weed_shell
	echo "[bootstrap] done (policy re-applied)"
	exit 0
fi

echo "[bootstrap] WARNING: access_key exists but secret_key differs."

if [ "${ALLOW_ROTATE}" = "1" ]; then
	echo "[bootstrap] rotating secret_key (explicitly allowed)"
	printf 's3.configure -user=%s -access_key=%s -secret_key=%s -buckets=%s -actions=%s -apply\n' \
		"${USER}" "${AK}" "${SK}" "${S3_BUCKETS}" "${ACTIONS}" |
		weed_shell
	echo "[bootstrap] done (secret rotated)"
	exit 0
else
	echo "[bootstrap] refusing to rotate secret_key by default"
	exit 2
fi
