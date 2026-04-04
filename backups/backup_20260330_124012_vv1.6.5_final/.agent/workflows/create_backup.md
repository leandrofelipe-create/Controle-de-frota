---
description: Fazer backup de segurança antes de qualquer modificação de código
---
Todos os assistentes virtuais (AIs) DEVEM executar este workflow ANTES de iniciarem modificações agressivas na base de código, em especial ao criar uma nova versão ou modificar a lógica central do aplicativo.

Isso previne a perda de código funcional (como aconteceu no passado onde versões anteriores de app.js foram perdidas ou sobrescritas).

Passos requeridos:
1. Identifique a versão atual que o sistema está rodando (ex: olhando a tag VERSION no app.js).
2. Execute o script de backup via terminal.
// turbo
3. `python backup.py VERSION_ATUAL` (ex: `python backup.py 1.6.5`)
4. Verifique se a pasta foi criada dentro do diretório `/backups/` com sucesso.
5. Somente após a confirmação visual de que o backup foi gerado, prossiga com as edições no código-fonte principal.
