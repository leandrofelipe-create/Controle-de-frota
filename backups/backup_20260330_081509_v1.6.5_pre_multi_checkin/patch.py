import re
import codecs

with codecs.open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add safe wrappers at the top (after VERSION)
wrappers = '''
// --- UTILITÁRIOS PARA LOCALSTORAGE SEGURO ---
const safeGetLocal = (key) => { try { return localStorage.getItem(key); } catch(e) { return null; } };
const safeSetLocal = (key, val) => { try { localStorage.setItem(key, val); } catch(e) {} };
const safeRemoveLocal = (key) => { try { localStorage.removeItem(key); } catch(e) {} };
'''

if 'safeGetLocal' not in content:
    content = content.replace("const VERSION = '1.6.3';", "const VERSION = '1.6.3';\n" + wrappers)

# 2. Replace all localStorage calls
content = re.sub(r'localStorage\.getItem\((.*?)\)', r'safeGetLocal(\1)', content)
content = re.sub(r'localStorage\.setItem\((.*?),\s*(.*?)\)', r'safeSetLocal(\1, \2)', content)
content = re.sub(r'localStorage\.removeItem\((.*?)\)', r'safeRemoveLocal(\1)', content)

# 3. Update FleetManager.saveData
old_save_data = '''    async saveData() {
        if (!this.data) return;

        try {
            await idbApp.set(DB_KEY, this.data);
        } catch (e) {
            console.error("Erro no IndexedDB:", e);
            alert("⚠️ Não foi possível salvar dados localmente devido a um erro no armazenamento interno (IndexedDB).");
        }

        if (this.isOnline) {
            try {
                await this.dbRef.set(this.data);
                await this.syncPending();
            } catch (e) {
                console.error("Erro ao salvar na nuvem:", e);
                this.isOnline = false;
                App.updateSyncStatus();
            }
        } else {
            console.log("Offline: Dados salvos apenas localmente.");
        }
        App.updateSyncStatus();
    }'''

new_save_data = '''    async saveData(forceOverwrite = false) {
        if (!this.data) return;

        try {
            await idbApp.set(DB_KEY, this.data);
        } catch (e) {
            console.error("Erro no IndexedDB:", e);
            alert("⚠️ Não foi possível salvar dados localmente devido a um erro no armazenamento interno (IndexedDB).");
        }

        if (this.isOnline) {
            try {
                if (forceOverwrite) {
                    await this.dbRef.set(this.data);
                } else {
                    await this.dbRef.transaction((cloudData) => {
                        if (cloudData) {
                            const mergeArrays = (cloudArr = [], localArr = []) => {
                                const map = new Map(cloudArr.map(item => [item.id, item]));
                                localArr.forEach(item => map.set(item.id, item));
                                return Array.from(map.values());
                            };
                            
                            cloudData.usageLogs = mergeArrays(cloudData.usageLogs, this.data.usageLogs);
                            cloudData.fuelLogs = mergeArrays(cloudData.fuelLogs, this.data.fuelLogs);
                            
                            if (!cloudData.activeSessions) cloudData.activeSessions = {};
                            const localSessions = this.data.activeSessions || {};
                            
                            Object.keys(localSessions).forEach(key => cloudData.activeSessions[key] = localSessions[key]);
                            
                            if (window.App && window.App.localUser) {
                                const uid = String(window.App.localUser);
                                if (!localSessions[uid] && !localSessions[Number(uid)]) {
                                    delete cloudData.activeSessions[uid];
                                    delete cloudData.activeSessions[Number(uid)];
                                }
                            }
                            
                            cloudData.vehicles = mergeArrays(cloudData.vehicles, this.data.vehicles);
                            cloudData.drivers = mergeArrays(cloudData.drivers, this.data.drivers);
                            
                            return cloudData;
                        }
                        return this.data;
                    });
                }
                
                const snapshot = await this.dbRef.once('value');
                const freshData = snapshot.val();
                if (freshData) {
                    this.data = freshData;
                    await idbApp.set(DB_KEY, this.data);
                }
                
                await this.syncPending();
            } catch (e) {
                console.error("Erro ao salvar na nuvem:", e);
                this.isOnline = false;
                App.updateSyncStatus();
            }
        } else {
            console.log("Offline: Dados salvos apenas localmente.");
        }
        App.updateSyncStatus();
    }'''

if 'async saveData() {' in content:
    content = content.replace(old_save_data, new_save_data)

# 4. Update syncPending
old_sync_pending = '''    async syncPending() {
        if (!this.isOnline || this.pendingSync.length === 0) return;

        console.log(`Sincronizando ${this.pendingSync.length} alterações pendentes...`);
        // Como o app é baseado em um estado único (this.data) que é sobrescrito,
        // o salvamento mais recente do this.data já contém todas as mudanças locais.
        // Basta um set() bem sucedido para sincronizar tudo.
        try {
            await this.dbRef.set(this.data);
            this.pendingSync = [];
            safeSetLocal('fleet_pending_sync', JSON.stringify(this.pendingSync));
            console.log("Sincronização concluída!");
            App.updateSyncStatus();
        } catch (e) {
            console.error("Falha na sincronização:", e);
        }
    }'''

new_sync_pending = '''    async syncPending() {
        if (!this.isOnline || this.pendingSync.length === 0) return;

        console.log(`Sincronizando ${this.pendingSync.length} alterações pendentes...`);
        try {
            this.pendingSync = [];
            safeSetLocal('fleet_pending_sync', JSON.stringify(this.pendingSync));
            console.log("Sincronização concluída!");
            App.updateSyncStatus();
        } catch (e) {
            console.error("Falha na sincronização:", e);
        }
    }'''

if old_sync_pending in content:
    content = content.replace(old_sync_pending, new_sync_pending)

# 5. forceOverwrite on admin actions
content = content.replace("async deleteVehicle(id) { this.data.vehicles = this.data.vehicles.filter(v => v.id != id); await this.saveData(); }", "async deleteVehicle(id) { this.data.vehicles = this.data.vehicles.filter(v => v.id != id); await this.saveData(true); }")
content = content.replace("async deleteDriver(id) { this.data.drivers = this.data.drivers.filter(d => d.id != id); await this.saveData(); }", "async deleteDriver(id) { this.data.drivers = this.data.drivers.filter(d => d.id != id); await this.saveData(true); }")
content = content.replace("await manager.saveData();\n                    alert(\"Histórico exportado foi removido.\");", "await manager.saveData(true);\n                    alert(\"Histórico exportado foi removido.\");")
content = content.replace("await manager.saveData();\n        App.switchAdminTab('sessions');", "await manager.saveData(true);\n        App.switchAdminTab('sessions');")

with codecs.open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
