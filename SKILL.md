# Agent Module Skill

Use este contrato ao alterar o modulo `agent/`.

## Fonte de Verdade

- Runtime: `agent/main.ts`
- Instalador: `scripts/install-agent.sh`
- Systemd unit gerado: `mnscloud-agent.service`
- Documentacao: `agent/agent.md`
- API runtime: `api/routes/agentRoute.ts`, `api/controllers/agentController.ts`, `api/services/agentRuntimeService.ts`
- Monitoramento: `MonitoringAgent`, `MonitoringAgentCapability`, `MonitoringAgentAssignment`

## Nomenclatura Obrigatoria

- Produto: `mnscloud-agent`
- Pasta: `agent`
- Servico: `mnscloud-agent`
- Configuracao local: `agent.conf`

Nunca criar nomes, rotas, modos ou instaladores especificos por tecnologia. O contrato deste modulo e sempre generico.

## Modelo

O agente e unico. Nao criar modos paralelos de execucao no produto. Recursos especificos entram por:

- `capabilities`: exemplo `security.crowdsec.manage`, `voip.asterisk.manage`
- `assignments`: exemplo `voip_pabx_server`
- `jobs`: exemplo `cyber_security`, `recording_upload`, `pabx_command`

Nao adicionar acoplamento direto de recurso, modo ou privilegio na identidade principal do agente.

## Seguranca

- Comunicacao apenas outbound por HTTPS.
- O instalador nao define tenant, recurso ou funcao.
- O agente declara capabilities locais; a API decide entrega por capability + assignment.
- Token do agente fica em `/var/lib/mnscloud/agent/agent.token`.
- Credenciais permanentes de storage ficam somente na API.
- Jobs usam autorizacao temporaria, preferencialmente URL assinada.
- Comandos locais devem ser tipados e allowlisted no runtime.

## Checklist

- Atualizar documentacao quando mudar contrato do agente.
- Rodar busca de residuos por nomes antigos.
- Validar `scripts/install-agent.sh` com `bash -n`.
- Validar `agent/main.ts` com `deno check`.
- Validar servicos da API relacionados com `deno check`.
- Validar frontend com `npm --prefix app run build` quando alterar UI.
