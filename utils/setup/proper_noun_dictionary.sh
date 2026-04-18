#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)"
STANDARD_HEADER="surface,yomi,priority,category,enabled,ambiguous"

TARGET_PATH="${1:-${REPO_ROOT}/volumes/proper-noun-dictionaries}"

case "${TARGET_PATH}" in
    /*) ;;
    *) TARGET_PATH="${REPO_ROOT}/${TARGET_PATH}" ;;
esac

normalize_csv_header() {
    csv_path="$1"

    if [ ! -f "${csv_path}" ]; then
        return 0
    fi

    first_line="$(head -n 1 "${csv_path}" || true)"
    case "${first_line}" in
        surface,yomi,*|surface,yomi)
            return 0
            ;;
    esac

    tmp_file="$(mktemp "${csv_path}.XXXXXX")"
    {
        printf '%s\n' "${STANDARD_HEADER}"
        cat "${csv_path}"
    } > "${tmp_file}"
    mv "${tmp_file}" "${csv_path}"
    echo "Added standard CSV header to: ${csv_path}"
}

if [ -d "${TARGET_PATH}" ]; then
    find "${TARGET_PATH}" -type f -name '*.csv' | while IFS= read -r csv_path; do
        normalize_csv_header "${csv_path}"
    done
    find "${TARGET_PATH}" -type d -exec chmod 755 {} +
    find "${TARGET_PATH}" -type f -exec chmod 644 {} +
    echo "Prepared proper noun dictionary directory: ${TARGET_PATH}"
    echo "Applied CSV normalization and permissions: directories=755 files=644"
    exit 0
fi

PARENT_DIR="$(dirname "${TARGET_PATH}")"
mkdir -p "${PARENT_DIR}"
chmod 755 "${PARENT_DIR}"

if [ -e "${TARGET_PATH}" ]; then
    case "${TARGET_PATH}" in
        *.csv) normalize_csv_header "${TARGET_PATH}" ;;
    esac
    chmod 644 "${TARGET_PATH}"
    echo "Prepared proper noun dictionary file: ${TARGET_PATH}"
    echo "Applied CSV normalization and permissions: parent_directory=755 file=644"
    exit 0
fi

mkdir -p "${TARGET_PATH}"
chmod 755 "${TARGET_PATH}"
echo "Created proper noun dictionary directory: ${TARGET_PATH}"
echo "Applied permissions: directories=755"
