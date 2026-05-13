# MNSCloud Agent

## Visão Geral

`mnscloud-agent` é o agente local genérico da plataforma. Ele não é um agente PABX por nome; PABX é apenas a primeira capacidade suportada. O mesmo runtime deve aceitar novas capacidades no futuro, como `db`, `api`, `server`, `sbc` ou `softswitch`, sem mudar nome de container, pasta, configuração ou API pública.

## Arquitetura

O agente roda próximo ao recurso operacional. No caso atual, ele roda no host onde Asterisk ou FreeSWITCH gravam arquivos de áudio. A API central controla identidade, permissões e jobs.

Fluxo:

1. O instalador cria `/etc/mnscloud/agent/agent.conf`.
2. O agente lê `node.uuid` e o token bootstrap do recurso local.
3. O agente faz enrollment em `POST /api/v1/agent/enroll`.
4. A API cria ou atualiza `MonitoringAgent`, `MonitoringAgentCapability` e `MonitoringAgentAssignment`.
5. O agente passa a enviar heartbeat em `POST /api/v1/agent/heartbeat`.
6. O agente busca jobs em `POST /api/v1/agent/jobs/lease`.
7. Para gravações, a API fornece URL assinada temporária.
8. O agente faz upload e confirma ou falha o job.

## Configuração

Arquivo canônico local:

```text
/etc/mnscloud/agent/agent.conf
```

Formato:

```ini
[agent]
name = asterisk-dev1
api_base = https://dev1.publichost.cloud
capabilities = pabx
version = 0.1.0
poll_interval_ms = 15000
heartbeat_interval_ms = 60000

[identity]
agent_uuid_file = /var/lib/mnscloud/agent/agent.uuid
agent_token_file = /var/lib/mnscloud/agent/agent.token
node_uuid_file = /etc/mnscloud/agent/secrets/node.uuid
api_token_file = /etc/mnscloud/agent/secrets/api.token

[pabx]
engine = freeswitch

[recordings]
roots = /recordings/freeswitch,/recordings/asterisk
mounts = /var/lib/freeswitch/recordings=/recordings/freeswitch,/var/spool/asterisk/monitor=/recordings/asterisk
```

Não usar `.env` para o agente. Seguir `agent.conf` para dados de configuração e `/etc/mnscloud/agent/secrets` para tokens bootstrap.

## Banco de Dados

Modelo canônico:

- `MonitoringAgent`: identidade, token, hostname, versão, status, heartbeat e tenant.
- `MonitoringAgentCapability`: capacidades do agente, como `pabx`.
- `MonitoringAgentAssignment`: recursos atribuídos ao agente, como `voip_pabx_server`.

Não adicionar colunas de tipo ou recurso diretamente em `MonitoringAgent`. A relação deve ser sempre por capability e assignment.

## API

Endpoints canônicos:

- `POST /api/v1/agent/enroll`
- `POST /api/v1/agent/heartbeat`
- `POST /api/v1/agent/jobs/lease`
- `POST /api/v1/agent/jobs/:uuid/complete`
- `POST /api/v1/agent/jobs/:uuid/fail`

Headers canônicos:

- `Authorization: Bearer <token>`
- `X-MNSCloud-Node-UUID: <uuid>`
- `X-MNSCloud-Agent-UUID: <uuid>` depois do enrollment

Não criar endpoints específicos por capacidade. O PABX é tratado por payload/capability dentro do agente genérico.

## Docker

Container:

```text
mnscloud-agent
```

Imagem local:

```text
mnscloud/agent:local
```

O container deve ser restrito:

- `read_only: true`
- `network_mode: host`
- `cap_drop: [ALL]`
- `security_opt: no-new-privileges:true`
- `/etc/mnscloud/agent` montado somente leitura
- `/var/lib/mnscloud/agent` gravável para `agent.uuid` e `agent.token`
- diretórios de gravação montados somente leitura

## Capacidade PABX

O agente PABX faz:

- heartbeat do host/engine;
- lease de jobs de upload de gravações;
- leitura de arquivo local validada por path allowlist;
- upload por URL assinada;
- confirmação ou falha do job.

Asterisk e FreeSWITCH gravam primeiro em filesystem local. O agente é responsável por mover a gravação para storage externo quando o PABX estiver configurado para storage.

## Regras de Evolução

- Não criar nomes específicos por tecnologia ou função.
- Não usar `.env` como contrato de configuração do agente.
- Não colocar credencial permanente de storage no agente.
- Novas funções entram como capabilities e assignments.
- A interface de monitoramento deve ler `MonitoringAgent` e suas relações, não tabelas específicas de cada recurso.
