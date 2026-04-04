import os
import sys
import shutil
import datetime

def create_backup(version_suffix=""):
    source_dir = "."
    backup_base = "backups"
    
    if not os.path.exists(backup_base):
        os.makedirs(backup_base)
        
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    folder_name = f"backup_{timestamp}"
    if version_suffix:
        folder_name += f"_v{version_suffix}"
        
    backup_dir = os.path.join(backup_base, folder_name)
    os.makedirs(backup_dir)
    
    ignore_patterns = shutil.ignore_patterns('.git', 'node_modules', 'backups', '__pycache__', '.firebase')
    
    print(f"Criando backup em: {backup_dir}")
    
    for item in os.listdir(source_dir):
        if item in ['.git', 'node_modules', 'backups', '__pycache__', '.firebase', '.firebaserc']:
            continue
            
        s = os.path.join(source_dir, item)
        d = os.path.join(backup_dir, item)
        
        try:
            if os.path.isdir(s):
                shutil.copytree(s, d, ignore=ignore_patterns)
            else:
                shutil.copy2(s, d)
        except Exception as e:
            print(f"Erro ao copiar {item}: {e}")
            
    print("Backup concluído com sucesso!")

if __name__ == "__main__":
    version = sys.argv[1] if len(sys.argv) > 1 else ""
    create_backup(version)
