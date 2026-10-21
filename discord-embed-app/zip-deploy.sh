#!/bin/bash
# Gera o arquivo zip para upload no ShardCloud
# Uso: bash zip-deploy.sh
set -e

OUTPUT="discord-embed-builder.zip"

echo "📦 Gerando $OUTPUT para ShardCloud..."

zip -r "$OUTPUT" . \
  --exclude "node_modules/*" \
  --exclude ".env" \
  --exclude "*.log" \
  --exclude ".git/*" \
  --exclude "$OUTPUT"

echo "✅ Pronto: $OUTPUT"
echo "📤 Faça upload deste arquivo no painel do ShardCloud"
