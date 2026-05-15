# MNSCloud Agent

## Visao Geral

`mnscloud-agent` e o agente local generico da plataforma. Ele nao e um agente PABX, firewall ou Docker por nome; esses comportamentos entram como capabilities e jobs. Existe um unico runtime. O limite real vem das permissoes do sistema operacional, do `agent.conf`, das capabilities sincronizadas e dos assignments cadastrados na API.

## Arquitetura

1. O instalador cria `/etc/mnscloud/agent/agent.conf`.
2. O instalador gera ou reaproveita `/var/lib/mnscloud/agent/agent.uuid`.
3. O operador cadastra o UUID na aplicacao MNSCloud.
4. A aplicacao gera o token e o operador grava `/var/lib/mnscloud/agent/agent.token`.
5. O agente envia heartbeat em `POST /api/v1/agent/heartbeat`.
6. O heartbeat sincroniza capabilities declaradas pelo host.
7. A API entrega jobs em `POST /api/v1/agent/jobs/lease` conforme capability e assignment.
8. O agente executa o job localmente e confirma sucesso ou falha.

## Configuracao

Arquivo canonico local:

```text
/etc/mnscloud/agent/agent.conf
```

Formato:

```ini
[agent]
name = server-01
hostname = server-01.local
api_base = https://dev1.publichost.cloud
version = 0.1.0
poll_interval_ms = 15000
heartbeat_interval_ms = 60000

[identity]
agent_uuid_file = /var/lib/mnscloud/agent/agent.uuid
agent_token_file = /var/lib/mnscloud/agent/agent.token

[capabilities]
linux.status = true
linux.package.install = true
linux.service.manage = true
linux.file.manage = true
security.nftables.manage = true
security.crowdsec.manage = true
security.logs.read = true
voip.asterisk.manage = false
voip.freeswitch.manage = false
docker.manage = false
shell.exec = false

[recordings]
roots = /var/lib/freeswitch/recordings,/var/spool/asterisk/monitor
mounts =
delete_after_upload = true

[media_files]
roots = /var/lib/mnscloud/pabx/media-files
mounts =

[commands]
asterisk_cli = asterisk
freeswitch_cli = fs_cli
asterisk_ami_host = 127.0.0.1
asterisk_ami_port = 5038
asterisk_ami_username =
asterisk_ami_secret =
freeswitch_esl_host = 127.0.0.1
freeswitch_esl_port = 8021
freeswitch_esl_password =
timeout_ms = 15000
```

Nao usar `.env` para o agente. Identidade e estado ficam em `/var/lib/mnscloud/agent`.

## Banco de Dados

Modelo canonico:

- `MonitoringAgent`: identidade, token, hostname, versao, status, heartbeat e tenant.
- `MonitoringAgentCapability`: capabilities declaradas pelo agente, como `linux.status`, `security.crowdsec.manage`, `voip.asterisk.manage`.
- `MonitoringAgentAssignment`: recursos atribuidos ao agente, como `voip_pabx_server` ou futuros recursos de cyber security.

Nao adicionar colunas de tipo, modo ou recurso diretamente em `MonitoringAgent`. A relacao deve ser sempre por capability e assignment.

## API

Endpoints canonicos:

- `POST /api/v1/agent/heartbeat`
- `POST /api/v1/agent/jobs/lease`
- `POST /api/v1/agent/jobs/:uuid/complete`
- `POST /api/v1/agent/jobs/:uuid/fail`

Headers canonicos:

- `Authorization: Bearer <token>`
- `X-MNSCloud-Agent-UUID: <uuid>`

Nao criar endpoints especificos por tecnologia. PABX, cyber security e futuras funcoes devem trafegar pelo mesmo lease/complete/fail com `jobType` e payload tipado.

## Capabilities

Capabilities sao nomes estaveis e granulares. Exemplos:

- `linux.status`
- `linux.package.install`
- `linux.service.manage`
- `linux.file.manage`
- `security.nftables.manage`
- `security.crowdsec.manage`
- `security.logs.read`
- `voip.asterisk.manage`
- `voip.freeswitch.manage`
- `docker.manage`
- `shell.exec`

O agente declara capabilities no heartbeat. A API usa essas capabilities junto com assignments para decidir quais jobs podem ser entregues.

## PABX

Para PABX, o assignment continua sendo `voip_pabx_server`, mas a capability agora e do engine:

- Asterisk: `voip.asterisk.manage`
- FreeSWITCH: `voip.freeswitch.manage`

Com assignment e capability compativeis, o agente pode:

- sincronizar upload de gravacoes;
- remover gravacao local apos upload confirmado;
- sincronizar media files offline;
- executar comandos locais permitidos por job;
- usar AMI/ESL local quando configurado ou CLI local como fallback.

## Cyber Security

Cyber security usa o mesmo runtime. Jobs como instalacao/configuracao de nftables e CrowdSec devem exigir capabilities explicitas (`security.nftables.manage`, `security.crowdsec.manage`) e assignments adequados.
