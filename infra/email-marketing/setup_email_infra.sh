#!/usr/bin/env bash
# setup_email_infra.sh — provisiona Postfix + OpenDKIM numa VPS Ubuntu/Debian
# limpa, pra atuar como MTA de saída das campanhas do MatchImóveis via Listmonk.
#
# Rodar como root (ou com sudo) numa VPS NOVA, dedicada só a isso — não
# roda numa máquina que já tem outro Postfix/serviço de e-mail configurado.
#
#   sudo bash setup_email_infra.sh
#
# O que este script faz, em ordem:
#   1. Instala Postfix + OpenDKIM + utilitários
#   2. Gera o par de chaves DKIM (2048 bits)
#   3. Ajusta permissões (OpenDKIM roda sem privilégio de root)
#   4. Copia main.cf/opendkim.conf pro lugar certo
#   5. Configura rotação de log
#   6. Sobe os serviços e mostra a chave pública pra colocar no DNS

set -euo pipefail

DOMINIO="matchimoveis.online"
SELETOR="match2026"
HOSTNAME_MTA="mail.matchimoveis.online"
DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Roda como root (sudo bash setup_email_infra.sh)." >&2
  exit 1
fi

echo "==> [1/6] Instalando Postfix, OpenDKIM e utilitários..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# Durante a instalação do Postfix, escolhe "Internet Site" quando perguntar
# e confirma o hostname acima ($HOSTNAME_MTA) na tela de configuração.
apt-get install -y postfix opendkim opendkim-tools mailutils logrotate

echo "==> [2/6] Gerando par de chaves DKIM (2048 bits) pro domínio $DOMINIO..."
mkdir -p "/etc/opendkim/keys/$DOMINIO"
opendkim-genkey -b 2048 -d "$DOMINIO" -D "/etc/opendkim/keys/$DOMINIO" -s "$SELETOR" -v
mv "/etc/opendkim/keys/$DOMINIO/$SELETOR.private" "/etc/opendkim/keys/$DOMINIO/$SELETOR.private" 2>/dev/null || true

echo "==> [3/6] Ajustando permissões (OpenDKIM nunca roda como root)..."
id -u opendkim &>/dev/null || adduser --system --group --no-create-home opendkim
usermod -aG opendkim postfix
chown -R opendkim:opendkim /etc/opendkim
chmod 700 "/etc/opendkim/keys/$DOMINIO"
chmod 600 "/etc/opendkim/keys/$DOMINIO/$SELETOR.private"
mkdir -p /var/run/opendkim
chown opendkim:opendkim /var/run/opendkim

echo "==> [4/6] Copiando configuração (main.cf, opendkim.conf, KeyTable, SigningTable, TrustedHosts)..."
cp "$DIR_SCRIPT/postfix/main.cf" /etc/postfix/main.cf
cp "$DIR_SCRIPT/opendkim/opendkim.conf" /etc/opendkim.conf
cp "$DIR_SCRIPT/opendkim/KeyTable" /etc/opendkim/KeyTable
cp "$DIR_SCRIPT/opendkim/SigningTable" /etc/opendkim/SigningTable
cp "$DIR_SCRIPT/opendkim/TrustedHosts" /etc/opendkim/TrustedHosts

# Descobre o range interno do Docker (172.x.x.x/16 é o padrão do bridge
# default) e substitui o placeholder nos arquivos copiados — ajusta na mão
# se sua rede Docker usar outro range (docker network inspect bridge).
RANGE_DOCKER="172.16.0.0/12"
sed -i "s#TODO_RANGE_DOCKER_INTERNO#$RANGE_DOCKER#g" /etc/postfix/main.cf /etc/opendkim/TrustedHosts

echo "==> [5/6] Configurando rotação de log..."
cat > /etc/logrotate.d/mail-marketing <<'EOF'
/var/log/mail.log
/var/log/mail.err
{
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 syslog adm
}
EOF

echo "==> [6/6] Reiniciando serviços..."
systemctl enable postfix opendkim
systemctl restart opendkim
systemctl restart postfix

echo ""
echo "======================================================================"
echo " PRONTO. Chave pública DKIM pra publicar no DNS (ver DNS-RECORDS.md):"
echo "======================================================================"
cat "/etc/opendkim/keys/$DOMINIO/$SELETOR.txt"
echo "======================================================================"
echo ""
echo "Próximos passos:"
echo "  1. Publica os registros DNS (DNS-RECORDS.md) — inclusive a chave acima."
echo "  2. Confirma o PTR (reverse DNS) do IP dessa VPS com o provedor."
echo "  3. Testa: echo 'teste' | mail -s 'teste dkim' seu-email-pessoal@gmail.com"
echo "  4. Confere em https://www.mail-tester.com antes de mandar pra base real."
echo "  5. Só depois disso, sobe o Listmonk (docker compose up -d)."
