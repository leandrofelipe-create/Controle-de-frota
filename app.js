/**
 * Controle de Abastecimento - Sistema de Monitoramento V3 (Nuvem)
 * Com Firebase Realtime Database para acesso global
 */

const DB_KEY = 'fleet_monitor_db_v3';

// CONFIGURAÇÃO DO FIREBASE (NUVEM)
// Substitua pelos seus dados do console do Firebase se desejar
const firebaseConfig = {
    apiKey: "AIzaSyBwBVdTfsGfveG1a5Z94UUIo9DgYu3qS4s",
    authDomain: "controle-de-frota-b8c8c.firebaseapp.com",
    databaseURL: "https://controle-de-frota-b8c8c-default-rtdb.firebaseio.com",
    projectId: "controle-de-frota-b8c8c",
    storageBucket: "controle-de-frota-b8c8c.firebasestorage.app",
    messagingSenderId: "829635363225",
    appId: "1:829635363225:web:86606bdea341f737ef5308"
};

console.log("App: Iniciando carregamento do app.js");

// Inicializa Firebase apenas se não estiver inicializado
if (!firebase.apps.length) {
    console.log("App: Inicializando Firebase...");
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
console.log("App: Conexão com Firebase estabelecida.");

class FleetManager {
    constructor() {
        this.data = null;
        this.dbRef = db.ref('fleet_data');
    }

    async init() {
        console.log("App: FleetManager.init() iniciado.");
        return new Promise((resolve, reject) => {
            console.log("App: Aguardando snapshot do Firebase...");
            this.dbRef.on('value', (snapshot) => {
                console.log("App: Snapshot recebido do Firebase!");
                const cloudData = snapshot.val();
                if (cloudData) {
                    this.data = cloudData;
                } else {
                    // Estado inicial se o banco estiver vazio
                    this.data = {
                        vehicles: [
                            { id: 1, name: 'Hilux - ABC-1234', plate: 'ABC-1234', model: 'Toyota Hilux', type: 'car', defaultFuel: 'Diesel S10', lastVal: 15200 },
                            { id: 2, name: 'Barco Turbo', plate: 'BRA-9988', model: 'Lancha 24ft', type: 'boat', defaultFuel: 'Gasolina', lastVal: 450 }
                        ],
                        drivers: [
                            { id: 1, name: 'João Silva' },
                            { id: 2, name: 'Maria Santos' },
                            { id: 3, name: 'Leandro Felipe' }
                        ],
                        usageLogs: [],
                        fuelLogs: [],
                        currentUser: null
                    };
                    this.saveData(); // Cria o nó inicial na nuvem
                }

                // Backup local para rapidez no app
                localStorage.setItem(DB_KEY, JSON.stringify(this.data));

                // Dispara a renderização inicial ou atualização
                if (window.App) {
                    if (window.App.currentView) {
                        window.App.render(window.App.currentView, window.App.currentProps);
                    } else {
                        window.App.render(window.App.views.Login);
                    }
                }

                resolve(this.data);
            });
        });
    }

    async saveData() {
        if (!this.data) return;
        return this.dbRef.set(this.data);
    }

    // --- Admin Actions ---
    async addVehicle(vehicle) {
        vehicle.id = Date.now();
        this.data.vehicles.push(vehicle);
        await this.saveData();
    }

    async deleteVehicle(id) {
        this.data.vehicles = this.data.vehicles.filter(v => v.id != id);
        await this.saveData();
    }

    async addDriver(name) {
        this.data.drivers.push({ id: Date.now(), name });
        await this.saveData();
    }

    async deleteDriver(id) {
        this.data.drivers = this.data.drivers.filter(d => d.id != id);
        await this.saveData();
    }

    async updateFuelLog(id, newData) {
        const index = this.data.fuelLogs.findIndex(l => l.id == id);
        if (index !== -1) {
            this.data.fuelLogs[index] = { ...this.data.fuelLogs[index], ...newData };
            await this.saveData();
        }
    }

    // --- Business Logic ---
    validateKM(vehicleId, currentVal) {
        const vehicle = this.data.vehicles.find(v => v.id == vehicleId);
        if (!vehicle) return { ok: true };

        const lastVal = vehicle.lastVal || 0;
        if (currentVal < lastVal) {
            return { ok: false, msg: `Valor (${currentVal}) é menor que o último registro (${lastVal}). Por favor corrija.` };
        }
        if (currentVal > lastVal + 2000) {
            return { ok: false, msg: `Salto muito grande detectado (mais de 2000 unidades). Verifique se o valor está correto.` };
        }
        return { ok: true };
    }

    simulateAIScan() {
        return new Promise(resolve => {
            setTimeout(() => {
                const liters = (Math.random() * 50 + 10).toFixed(2);
                const pricePerLiter = (Math.random() * 2 + 5).toFixed(2);
                resolve({
                    liters: liters,
                    pricePerLiter: pricePerLiter,
                    total: (liters * pricePerLiter).toFixed(2)
                });
            }, 1500);
        });
    }

    exportExcel() {
        const fuelData = this.data.fuelLogs.map((l, index) => {
            const vehicle = this.data.vehicles.find(v => v.id == l.vehicleId);
            const driver = this.data.drivers.find(d => d.id == l.driverId);

            let consumption = "N/A";
            if (l.isFull && vehicle) {
                // Encontra o abastecimento "cheio" anterior do mesmo veículo
                const previousFull = this.data.fuelLogs
                    .slice(0, index)
                    .reverse()
                    .find(log => log.vehicleId == l.vehicleId && log.isFull);

                if (previousFull) {
                    const diffVal = l.val - previousFull.val;
                    if (diffVal > 0) {
                        if (vehicle.type === 'car') {
                            consumption = (diffVal / l.liters).toFixed(2) + " km/L";
                        } else {
                            consumption = (l.liters / diffVal).toFixed(2) + " L/h";
                        }
                    }
                }
            }

            return {
                "ID": l.id,
                "Data": new Date(l.date).toLocaleString(),
                "Tipo": "Abastecimento",
                "Veículo": vehicle?.name || "N/A",
                "Operador": driver?.name || "N/A",
                "KM/Horas": l.val,
                "Litros": l.liters,
                "R$/Litro": l.pricePerLiter,
                "Total R$": l.total,
                "Combustível": l.fuelType,
                "Tanque Cheio": l.isFull ? "Sim" : "Não",
                "Média de Consumo": consumption
            };
        });

        const usageData = this.data.usageLogs.flatMap(l => {
            const vehicle = this.data.vehicles.find(v => v.id == l.vehicleId);
            const driver = this.data.drivers.find(d => d.id == l.driverId);
            const labelMetric = vehicle?.type === 'boat' ? 'Horas Trabalhadas' : 'KM Percorrido';
            return [
                {
                    "ID": l.id,
                    "Data": new Date(l.startTime).toLocaleString(),
                    "Tipo": "Check-In",
                    "Veículo": vehicle?.name || "N/A",
                    "Operador": driver?.name || "N/A",
                    "Valor": l.startVal,
                    "Métrica da Sessão": ""
                },
                {
                    "ID": l.id,
                    "Data": new Date(l.endTime).toLocaleString(),
                    "Tipo": "Check-Out",
                    "Veículo": vehicle?.name || "N/A",
                    "Operador": driver?.name || "N/A",
                    "Valor": l.endVal,
                    "Métrica da Sessão": `${l.sessionDiff || (l.endVal - l.startVal).toFixed(2)} (${labelMetric})`
                }
            ];
        });

        const workbook = XLSX.utils.book_new();
        const fuelSheet = XLSX.utils.json_to_sheet(fuelData);
        const usageSheet = XLSX.utils.json_to_sheet(usageData);

        XLSX.utils.book_append_sheet(workbook, fuelSheet, "Abastecimentos");
        XLSX.utils.book_append_sheet(workbook, usageSheet, "Check-Ins_Outs");

        XLSX.writeFile(workbook, "relatorio_frota.xlsx");
    }
}

const manager = new FleetManager();

const App = {
    currentPhoto: null,
    currentView: null,
    currentProps: {},

    async init() {
        await manager.init();
        // O render inicial agora é disparado pelo manager.init no snapshot
    },

    render(view, props = {}) {
        this.currentView = view;
        this.currentProps = props;
        const root = document.getElementById('app');

        if (!manager.data) {
            root.innerHTML = `<div class="loading-screen"><div class="spinner"></div><p>Conectando à nuvem...</p></div>`;
            return;
        }

        // Verifica login (exceto se for a própria view de login)
        if (!manager.data.currentUser && view !== this.views.Login) {
            return this.render(this.views.Login);
        }

        root.innerHTML = view(props);
        window.scrollTo(0, 0);
    },

    views: {
        Login: () => `
            <div class="auth-container slide-up">
                <div class="auth-logo">🛥️</div>
                <h1>Bem-vindo!</h1>
                <p style="color:var(--text-muted); margin-bottom: 30px">Por favor, selecione seu usuário para entrar.</p>
                <div class="auth-card">
                    <div class="form-group">
                        <label>Motorista / Operador</label>
                        <select id="login-driver-select">
                            ${manager.data.drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                        </select>
                    </div>
                    <button onclick="App.login()">Entrar no Sistema</button>
                </div>
            </div>
        `,

        Dashboard: () => {
            const user = manager.data.drivers.find(d => d.id == manager.data.currentUser);
            const isAdmin = user?.name === 'Leandro Felipe';

            return `
            <div class="container slide-up">
                <header style="display:flex; justify-content:space-between; align-items:center">
                    <div>
                        <p style="color:var(--text-muted)">Olá, <strong>${user?.name}</strong></p>
                        <h1>Controle de Abastecimento</h1>
                    </div>
                    <div style="display:flex; gap: 8px; align-items: center">
                        ${isAdmin ? `<button onclick="App.checkAdminAccess()" class="secondary" style="width:auto; padding:8px">⚙️ Admin</button>` : ''}
                        <button onclick="App.logout()" class="logout-btn">Sair</button>
                    </div>
                </header>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top:20px">
                    ${manager.data.currentSession ? `
                        <button onclick="App.render(App.views.CheckOut)" class="danger" style="grid-column: span 2">Finalizar Expediente (Check-out)</button>
                    ` : `
                        <button onclick="App.render(App.views.CheckIn)" style="grid-column: span 2">Iniciar Check-in</button>
                    `}
                    
                    <button class="secondary" onclick="App.render(App.views.FuelLog)" style="grid-column: span 2">
                        ⛽ Registrar Abastecimento
                    </button>
                    
                    <button class="secondary" onclick="App.init()" style="grid-column: span 2; font-size: 0.7rem; padding: 10px; opacity: 0.6">
                        🔄 Sincronizar Agora
                    </button>
                </div>
            </div>
        `},

        CheckIn: () => `
            <div class="container slide-up">
                <button class="secondary" style="width: auto; padding: 5px 15px; margin-bottom: 20px" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Check-in</h1>
                
                <div class="form-group">
                    <label>Veículo</label>
                    <select id="vehicle-select" onchange="App.handleVehicleChange(this.value, 'checkin-fields')">
                        <option value="">Selecione...</option>
                        ${manager.data.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                    </select>
                </div>

                <div id="checkin-fields">
                    <!-- Dinâmico base no tipo de veículo -->
                </div>
            </div>
        `,

        CheckOut: () => {
            const session = manager.data.currentSession;
            const vehicle = manager.data.vehicles.find(v => v.id == session.vehicleId);
            const isBoat = vehicle.type === 'boat';

            return `
            <div class="container slide-up">
                <button class="secondary" style="width: auto; padding: 5px 15px; margin-bottom: 20px" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Check-out</h1>
                <p>Veículo: <strong>${vehicle.name}</strong></p>

                ${isBoat ? `
                    <div class="card" style="background:#f8fafc; margin-top:1rem">
                        <p>Registro de horas será feito automaticamente na confirmação.</p>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>KM Final</label>
                        <input type="number" id="end-val" placeholder="Valor atual">
                    </div>
                `}

                <div class="form-group">
                    <label>Foto do Painel Final (Obrigatória)</label>
                    <div class="photo-preview" id="photo-preview" onclick="App.takePhoto()">
                        <span>Clique para tirar foto</span>
                    </div>
                </div>

                <button class="danger" onclick="App.submitCheckOut()">Finalizar e Salvar</button>
            </div>
        `},

        FuelLog: () => `
            <div class="container slide-up">
                <button class="secondary" style="width: auto; padding: 5px 15px; margin-bottom: 20px" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Abastecimento</h1>

                <div class="form-group">
                    <label>Veículo</label>
                    <select id="fuel-vehicle-select" onchange="App.handleVehicleChange(this.value, 'fuel-form-fields')">
                        <option value="">Selecione...</option>
                        ${manager.data.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                    </select>
                </div>

                <div id="fuel-form-fields">
                    <!-- Dinâmico -->
                </div>
            </div>
        `,

        AdminPanel: () => `
            <div class="container slide-up">
                <button class="secondary" style="width: auto; padding: 5px 15px; margin-bottom: 20px" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Administração</h1>
                
                <div class="admin-tabs">
                    <button class="tab-btn active" onclick="App.switchAdminTab('logs')">Logs</button>
                    <button class="tab-btn" onclick="App.switchAdminTab('vehicles')">Veículos</button>
                    <button class="tab-btn" onclick="App.switchAdminTab('drivers')">Motoristas</button>
                </div>

                <div id="admin-content" class="admin-list">
                    ${App.renderAdminLogs()}
                </div>

                <button class="secondary" style="margin-top:20px" onclick="manager.exportExcel()">📊 Exportar Excel Completo</button>
            </div>
        `
    },

    // --- Auth Logic ---
    async login() {
        const dId = document.getElementById('login-driver-select').value;
        manager.data.currentUser = dId;
        await manager.saveData();
        this.render(this.views.Dashboard);
    },

    async logout() {
        if (confirm("Deseja realmente sair?")) {
            manager.data.currentUser = null;
            await manager.saveData();
            this.render(this.views.Login);
        }
    },

    checkAdminAccess() {
        const pass = prompt("Digite a senha de administrador:");
        if (pass === "Essencio123") {
            this.render(this.views.AdminPanel);
        } else {
            alert("Senha incorreta!");
        }
    },

    // --- Helper Functions ---

    handleVehicleChange(id, targetId) {
        const vehicle = manager.data.vehicles.find(v => v.id == id);
        const container = document.getElementById(targetId);
        if (!vehicle || !container) return;

        const isBoat = vehicle.type === 'boat';

        if (targetId === 'checkin-fields') {
            container.innerHTML = `
                ${isBoat ? `
                    <div class="card" style="background:#f8fafc; margin-bottom: 1rem">
                        <p><strong>Configuração de Barco:</strong> Os dados de telemetria serão confirmados automaticamente.</p>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>KM Inicial</label>
                        <input type="number" id="start-val" placeholder="0.0">
                    </div>
                `}
                <div class="form-group">
                    <label>Foto do Painel (Obrigatória)</label>
                    <div class="photo-preview" id="photo-preview" onclick="App.takePhoto()">
                        <span>Clique para tirar foto</span>
                    </div>
                </div>
                <button onclick="App.submitCheckIn()">Confirmar Entrada</button>
            `;
        } else if (targetId === 'fuel-form-fields') {
            container.innerHTML = `
                <div class="card" style="background:#f8fafc; margin-bottom: 1.5rem">
                    <p style="font-size: 0.9rem; color: var(--text-muted)">
                        <strong>${isBoat ? 'Horímetro' : 'Odômetro'} Atual:</strong> ${vehicle.lastVal || 0} ${isBoat ? 'h' : 'km'}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--text-muted)">O valor será registrado automaticamente no abastecimento.</p>
                </div>

                <div class="form-group">
                    <label>Foto do Comprovante (Obrigatória)</label>
                    <div id="ai-status"></div>
                    <div class="photo-preview" id="photo-preview" onclick="App.processReceiptIA()">
                        <span>Clique para tirar foto e usar IA</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
                    <div class="form-group">
                        <label>Litros</label>
                        <input type="number" step="0.01" id="fuel-liters" oninput="App.calcFuelTotal()">
                    </div>
                    <div class="form-group">
                        <label>R$ por Litro</label>
                        <input type="number" step="0.01" id="fuel-price-l" oninput="App.calcFuelTotal()">
                    </div>
                </div>

                <div class="form-group">
                    <label>Valor Total (R$)</label>
                    <input type="number" step="0.01" id="fuel-total">
                </div>

                <div class="form-group">
                    <label>Tipo de Combustível</label>
                    <input type="text" id="fuel-type" value="${vehicle.defaultFuel}">
                </div>

                <div class="form-group" style="display:flex; align-items:center; gap:10px">
                    <input type="checkbox" id="fuel-full" style="width:auto; margin:0">
                    <label style="margin:0">Encheu o tanque?</label>
                </div>

                <button onclick="App.submitFuel()">Salvar Abastecimento</button>
            `;
        }
    },

    calcFuelTotal() {
        const liters = parseFloat(document.getElementById('fuel-liters').value) || 0;
        const price = parseFloat(document.getElementById('fuel-price-l').value) || 0;
        if (liters && price) {
            document.getElementById('fuel-total').value = (liters * price).toFixed(2);
        }
    },

    async processReceiptIA() {
        this.takePhoto();
        const status = document.getElementById('ai-status');
        status.innerHTML = `<div class="ai-processing"><div class="ai-dot"></div>IA Lendo comprovante...</div>`;

        const data = await manager.simulateAIScan();

        document.getElementById('fuel-liters').value = data.liters;
        document.getElementById('fuel-price-l').value = data.pricePerLiter;
        document.getElementById('fuel-total').value = data.total;
        status.innerHTML = `<div class="ai-processing" style="border-color:var(--success); color:var(--success)">IA: Dados extraídos!</div>`;
    },

    takePhoto() {
        const preview = document.getElementById('photo-preview');
        preview.innerHTML = `<img src="https://images.unsplash.com/photo-1594914141274-78304524ef6c?q=80&w=200&auto=format&fit=crop" alt="Foto">`;
        this.currentPhoto = "simulated_photo_url_" + Date.now();
    },

    async submitCheckIn() {
        const vId = document.getElementById('vehicle-select').value;
        const vehicle = manager.data.vehicles.find(v => v.id == vId);

        let val;
        if (vehicle.type === 'boat') {
            val = vehicle.lastVal || 0;
        } else {
            val = parseFloat(document.getElementById('start-val').value);
            if (isNaN(val)) return alert("Preencha o KM!");
        }

        if (!vId || !this.currentPhoto) return alert("Preencha todos os campos e tire a foto!");

        if (vehicle.type !== 'boat') {
            const validation = manager.validateKM(vId, val);
            if (!validation.ok) return alert(validation.msg);
        }

        manager.data.currentSession = {
            id: Date.now(),
            driverId: manager.data.currentUser,
            vehicleId: vId,
            startTime: new Date().toISOString(),
            startVal: val,
            startPhoto: this.currentPhoto
        };
        await manager.saveData();
        this.currentPhoto = null;
        this.render(this.views.Dashboard);
    },

    async submitCheckOut() {
        const session = manager.data.currentSession;
        const vehicle = manager.data.vehicles.find(v => v.id == session.vehicleId);

        let val;
        if (vehicle.type === 'boat') {
            val = (vehicle.lastVal || 0) + 1.5;
        } else {
            val = parseFloat(document.getElementById('end-val').value);
            if (isNaN(val)) return alert("Preencha o valor!");
        }

        if (!this.currentPhoto) return alert("Tire a foto!");

        if (vehicle.type !== 'boat') {
            const validation = manager.validateKM(session.vehicleId, val);
            if (!validation.ok) return alert(validation.msg);
        }

        const log = {
            ...session,
            endTime: new Date().toISOString(),
            endVal: val,
            sessionDiff: (val - session.startVal).toFixed(2), // Métrica calculada
            endPhoto: this.currentPhoto
        };
        manager.data.usageLogs.push(log);

        const v = manager.data.vehicles.find(v => v.id == session.vehicleId);
        if (v) v.lastVal = val;

        manager.data.currentSession = null;
        await manager.saveData();
        this.currentPhoto = null;
        this.render(this.views.Dashboard);
    },

    async submitFuel() {
        const vId = document.getElementById('fuel-vehicle-select').value;
        const vehicle = manager.data.vehicles.find(v => v.id == vId);

        // Busca automaticamente do sistema
        const val = vehicle.lastVal || 0;

        const liters = parseFloat(document.getElementById('fuel-liters').value);
        const priceL = parseFloat(document.getElementById('fuel-price-l').value);
        const total = parseFloat(document.getElementById('fuel-total').value);
        const type = document.getElementById('fuel-type').value;
        const isFull = document.getElementById('fuel-full').checked;

        if (isNaN(liters) || !this.currentPhoto) return alert("Preencha todos os dados e tire a foto!");

        const log = {
            id: Date.now(),
            driverId: manager.data.currentUser,
            vehicleId: vId,
            date: new Date().toISOString(),
            val: val,
            liters,
            pricePerLiter: priceL,
            total: total.toFixed(2),
            fuelType: type,
            isFull,
            photo: this.currentPhoto
        };

        const v = manager.data.vehicles.find(v => v.id == vId);
        if (v && isFull) v.lastVal = val;

        manager.data.fuelLogs.push(log);
        await manager.saveData();
        this.currentPhoto = null;
        this.render(this.views.Dashboard);
    },

    // --- Admin Views ---

    renderAdminLogs() {
        const fuelLogs = manager.data.fuelLogs.slice().reverse();
        const usageLogs = manager.data.usageLogs.slice().reverse();

        if (fuelLogs.length === 0 && usageLogs.length === 0) return "<p>Nenhum log encontrado.</p>";

        let html = "<h4>Abastecimentos</h4>";
        html += fuelLogs.map(l => `
            <div class="admin-item">
                <div>
                    <strong>${manager.data.vehicles.find(v => v.id == l.vehicleId)?.name}</strong><br>
                    <span style="font-size:0.7rem">${new Date(l.date).toLocaleDateString()} - ${l.liters}L - R$ ${l.total}</span>
                </div>
                <div class="actions">
                    <button class="btn-small" onclick="App.showPhoto('${l.photo}')">🖼️</button>
                    <button class="btn-small" onclick="App.editFuelLog(${l.id})">✏️</button>
                </div>
            </div>
        `).join('') || "<p>Sem abastecimentos.</p>";

        html += "<h4 style='margin-top:1rem'>Check-Ins/Outs</h4>";
        html += usageLogs.map(l => `
            <div class="admin-item">
                <div>
                    <strong>${manager.data.vehicles.find(v => v.id == l.vehicleId)?.name}</strong><br>
                    <span style="font-size:0.7rem">${new Date(l.startTime).toLocaleDateString()} - De ${l.startVal} até ${l.endVal}</span>
                </div>
                <div class="actions">
                    <button class="btn-small" onclick="App.showPhoto('${l.startPhoto}')">Photo 1</button>
                    <button class="btn-small" onclick="App.showPhoto('${l.endPhoto}')">Photo 2</button>
                </div>
            </div>
        `).join('') || "<p>Sem registros de uso.</p>";

        return html;
    },

    renderAdminVehicles() {
        return `
            <div style="margin-bottom:15px">
                <input type="text" id="new-v-name" placeholder="Nome/Placa">
                <select id="new-v-type">
                    <option value="car">Carro</option>
                    <option value="boat">Barco</option>
                </select>
                <button onclick="App.submitAddVehicle()" class="btn-small">Add Veículo</button>
            </div>
            ${manager.data.vehicles.map(v => `
                <div class="admin-item">
                    <span>${v.name} (${v.type})</span>
                    <button class="btn-small danger" onclick="App.deleteVehicle(${v.id})">🗑️</button>
                </div>
            `).join('')}
        `;
    },

    renderAdminDrivers() {
        return `
            <div style="margin-bottom:15px">
                <input type="text" id="new-d-name" placeholder="Nome do Motorista">
                <button onclick="App.submitAddDriver()" class="btn-small">Add Motorista</button>
            </div>
            ${manager.data.drivers.map(d => `
                <div class="admin-item">
                    <span>${d.name}</span>
                    <button class="btn-small danger" onclick="App.deleteDriver(${d.id})">🗑️</button>
                </div>
            `).join('')}
        `;
    },

    switchAdminTab(tab) {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');

        const content = document.getElementById('admin-content');
        if (tab === 'logs') content.innerHTML = App.renderAdminLogs();
        if (tab === 'vehicles') content.innerHTML = App.renderAdminVehicles();
        if (tab === 'drivers') content.innerHTML = App.renderAdminDrivers();
    },

    async submitAddVehicle() {
        const name = document.getElementById('new-v-name').value;
        const type = document.getElementById('new-v-type').value;
        if (!name) return;
        await manager.addVehicle({ name, type, lastVal: 0, defaultFuel: 'Gasolina' });
        App.switchAdminTab('vehicles');
    },

    async submitAddDriver() {
        const name = document.getElementById('new-d-name').value;
        if (!name) return;
        await manager.addDriver(name);
        App.switchAdminTab('drivers');
    },

    async deleteVehicle(id) { if (confirm("Excluir veículo?")) { await manager.deleteVehicle(id); App.switchAdminTab('vehicles'); } },
    async deleteDriver(id) { if (confirm("Excluir motorista?")) { await manager.deleteDriver(id); App.switchAdminTab('drivers'); } },

    showPhoto(url) {
        App.showModal(`<h3>Foto do Registro</h3><img src="${url}" style="width:100%; margin-top:10px; border-radius:10px">`);
    },

    editFuelLog(id) {
        const log = manager.data.fuelLogs.find(l => l.id == id);
        this.showModal(`
            <h3>Editar Abastecimento</h3>
            <div class="form-group">
                <label>Litros</label>
                <input type="number" id="edit-liters" value="${log.liters}">
            </div>
            <div class="form-group">
                <label>Valor KM/Horas</label>
                <input type="number" id="edit-val" value="${log.val}">
            </div>
            <button onclick="App.submitEditFuelLog(${id})">Salvar Alterações</button>
        `);
    },

    submitEditFuelLog(id) {
        const liters = parseFloat(document.getElementById('edit-liters').value);
        const val = parseFloat(document.getElementById('edit-val').value);
        manager.updateFuelLog(id, { liters, val });
        App.closeModal();
        App.switchAdminTab('logs');
    },

    showModal(html) {
        const div = document.createElement('div');
        div.className = 'modal-overlay';
        div.innerHTML = `<div class="modal-content"><button class="secondary" style="margin-bottom:10px" onclick="App.closeModal()">Fechar</button>${html}</div>`;
        document.body.appendChild(div);
    },

    closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
    }
};

window.App = App;
App.init(); 
