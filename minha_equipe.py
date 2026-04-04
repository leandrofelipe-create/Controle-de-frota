from crewai import Agent, Task, Crew

class FabricaDeProjetos:
    def __init__(self, tema_projeto, objetivo_final):
        self.tema = tema_projeto
        self.objetivo = objetivo_final
        self.agentes = self._criar_agentes()

    def _criar_agentes(self):
        # Aqui definimos a "alma" dos agentes de forma genérica
        return {
            "analista": Agent(
                role='Analista de Requisitos',
                goal=f'Mapear todas as necessidades para: {self.tema}',
                backstory='Especialista em transformar visões de negócio em planos técnicos executáveis.',
                verbose=True
            ),
            "arquiteto": Agent(
                role='Arquiteto de Soluções',
                goal=f'Desenhar a estrutura lógica e técnica para: {self.tema}',
                backstory='Garante que a solução seja escalável, segura e eficiente.',
                verbose=True
            ),
            "programador": Agent(
                role='Desenvolvedor Full Stack',
                goal=f'Implementar as funcionalidades principais de: {self.tema}',
                backstory='Transforma desenhos técnicos em código funcional de alta qualidade.',
                verbose=True
            ),
            "revisor": Agent(
                role='Revisor de Qualidade (QA)',
                goal=f'Validar se o resultado atende ao objetivo: {self.objetivo}',
                backstory='Detalhista, focado em encontrar erros e garantir a excelência.',
                verbose=True
            ),
            "master": Agent(
                role='Project Master',
                goal=f'Coordenar a entrega final do projeto: {self.tema}',
                backstory='Líder estratégico que garante a harmonia entre as áreas.',
                verbose=True
            )
        }

    def executar_projeto(self):
        # Criamos as tarefas dinamicamente com base no tema atual
        tarefas = [
            Task(description=f"Gerar relatório de requisitos para {self.tema}", agent=self.agentes["analista"], expected_output="Um documento com os requisitos levantados"),
            Task(description=f"Desenhar o mapa técnico da solução para {self.tema}", agent=self.agentes["arquiteto"], expected_output="Um diagrama arquitetural"),
            Task(description=f"Desenvolver o protótipo funcional inicial de {self.tema}", agent=self.agentes["programador"], expected_output="Protótipo do sistema"),
            Task(description=f"Testar e validar se {self.tema} cumpre o objetivo: {self.objetivo}", agent=self.agentes["revisor"], expected_output="Relatório de Qualidade"),
            Task(description=f"Consolidar a entrega final e manual de {self.tema}", agent=self.agentes["master"], expected_output="Um guia de entrega consolidado")
        ]

        # Orquestração
        equipe = Crew(
            agents=list(self.agentes.values()),
            tasks=tarefas,
            process='sequential',
            verbose=True
        )
        
        return equipe.kickoff()

# --- COMO USAR PARA QUALQUER COISA ---

# Exemplo 1: Automação Residencial
projeto_casa = FabricaDeProjetos("Sistema de Automação com Sonoff", "Controlar luzes e ar-condicionado via voz")
print(projeto_casa.executar_projeto())

# Exemplo 2: Análise de Investimentos
# projeto_fii = FabricaDeProjetos("Carteira de FIIs de Logística", "Rendimento mensal isento de 1% ao mês")
# print(projeto_fii.executar_projeto())