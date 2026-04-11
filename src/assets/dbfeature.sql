-- ===================================================================
-- FICHIER SQL COMPLET POUR LOGGAPPRO
-- Génération de toutes les tables avec 10 lignes de test par table
-- Toutes les données sont liées au même docteur de référence
-- 
-- IMPORTANT: 
-- - Aucune clé étrangère (FOREIGN KEY) n'est utilisée
-- - Tous les IDs et champs de relation sont en TEXT/VARCHAR (chaînes de caractères)
-- - Les relations sont gérées uniquement par correspondance de valeurs textuelles
-- ===================================================================
--
-- INSTRUCTIONS D'UTILISATION POUR phpMyAdmin:
-- 1. Remplacez toutes les occurrences de "1763705999657" par votre identifiant de table
--    Exemple: si votre tabId est "1750704217215", remplacez "1763705999657" par "1750704217215"
-- 2. Dans phpMyAdmin:
--    a) Allez dans l'onglet "SQL" de votre base de données
--    b) Copiez-collez TOUT ce fichier dans l'éditeur SQL
--    c) Cliquez sur "Exécuter" - phpMyAdmin gérera automatiquement les DELIMITER
-- 3. NE PAS exécuter "SET FOREIGN_KEY_CHECKS = ON;" - Ce fichier n'utilise AUCUNE clé étrangère
-- 4. Si vous obtenez une erreur, vérifiez que vous avez bien copié TOUT le fichier
-- ===================================================================

-- Définir le tabId (remplacez par votre identifiant réel)
-- Note: Le DELIMITER sera géré automatiquement par phpMyAdmin
SET @TABID = '1763705999657';

-- ===================================================================
-- PARTIE 0: NETTOYAGE (OPTIONNEL - Décommentez si vous voulez supprimer les tables existantes)
-- ===================================================================
-- ATTENTION: Décommenter cette section supprimera toutes les données existantes !
-- 
DROP TABLE IF EXISTS tab_trace1763705999657;
-- DROP TABLE IF EXISTS tab_privilege1763705999657;
DROP TABLE IF EXISTS tab_admin1763705999657;
DROP TABLE IF EXISTS tab_cabinet1763705999657;
-- DROP TABLE IF EXISTS tab_qr_code1763705999657;
DROP TABLE IF EXISTS tab_radio1763705999657;
DROP TABLE IF EXISTS tab_photo1763705999657;
DROP TABLE IF EXISTS tab_nom_assurance1763705999657;
DROP TABLE IF EXISTS tab_nom_acte1763705999657;
DROP TABLE IF EXISTS tab_assurance1763705999657;
DROP TABLE IF EXISTS tab_facture1763705999657;
DROP TABLE IF EXISTS tab_acte1763705999657;
DROP TABLE IF EXISTS tab_assistant1763705999657;
DROP TABLE IF EXISTS tab_comptable1763705999657;
DROP TABLE IF EXISTS tab_secretaire1763705999657;
-- DROP TABLE IF EXISTS tab_docteur1763705999657;
DROP TABLE IF EXISTS tab_patient1763705999657;
-- DROP TABLE IF EXISTS tab_user1763705999657;

-- ===================================================================
-- PARTIE 1: FONCTIONS UTILITAIRES
-- ===================================================================

-- Suppression de la fonction existante (si elle existe)
DROP FUNCTION IF EXISTS random_date;

-- Fonction pour générer une date de naissance aléatoire
DELIMITER //
CREATE FUNCTION random_date()
RETURNS DATE
DETERMINISTIC
BEGIN
    RETURN DATE_SUB(DATE_SUB(CURRENT_DATE, INTERVAL FLOOR(RAND() * 40) YEAR), INTERVAL FLOOR(RAND() * 365) DAY);
END;
//
DELIMITER ;

-- ===================================================================
-- PARTIE 2: CRÉATION DES TABLES
-- Remplacez 1763705999657 par votre identifiant avant d'exécuter
-- ===================================================================

-- Table: tab_user (utilisateurs généraux)
CREATE TABLE IF NOT EXISTS tab_user1763705999657 (
    id TEXT UNIQUE,
    nom VARCHAR(255),
    prenom VARCHAR(255),
    login VARCHAR(255) UNIQUE,
    password VARCHAR(255) DEFAULT '$2a$10$ILE6ShURm.iRBssegpQIDuo0XJUqSg7rwfu4WLXRaFNmbK.ifwLaW', -- mot de passe: "1234" (hashé avec bcrypt)
    telephone VARCHAR(20) UNIQUE,
    naissance DATE,
    role VARCHAR(50),
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    adresse VARCHAR(255) NULL,
    logg_id TEXT
);

-- Table: tab_patient (informations spécifiques aux patients)
CREATE TABLE IF NOT EXISTS tab_patient1763705999657 (
    id TEXT UNIQUE,
    nom_de_jeune_fille VARCHAR(255),
    profession VARCHAR(255),
    adresserPar VARCHAR(255),
    observation TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    avoir_annuelle VARCHAR(255) DEFAULT '0'
);

-- Table: tab_docteur (docteurs)
CREATE TABLE IF NOT EXISTS tab_docteur1763705999657 (
    id TEXT UNIQUE,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    logg_id TEXT
);

-- Table: tab_secretaire (secrétaires)
CREATE TABLE IF NOT EXISTS tab_secretaire1763705999657 (
    id TEXT UNIQUE,
    dateCreation DATETIME DEFAULT CURRENT_TIMESTAMP,
    logg_id TEXT
);

-- Table: tab_comptable (comptables)
CREATE TABLE IF NOT EXISTS tab_comptable1763705999657 (
    id TEXT UNIQUE,
    logg_id TEXT
);

-- Table: tab_assistant (assistants)
CREATE TABLE IF NOT EXISTS tab_assistant1763705999657 (
    id TEXT UNIQUE
);

-- Table: tab_acte (actes médicaux)
CREATE TABLE IF NOT EXISTS tab_acte1763705999657 (
    id TEXT UNIQUE,
    nom VARCHAR(255),
    description TEXT,
    date DATE,
    prix INT,
    argentRecu INT,
    argentRestant INT,
    logg_id TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Note: Les colonnes argentRecu et argentRestant sont en camelCase dans Sequelize
-- mais MySQL les stocke en minuscules. La requête SQL utilise des alias pour mapper.

-- Table: tab_facture (factures)
CREATE TABLE IF NOT EXISTS tab_facture1763705999657 (
    id TEXT UNIQUE,
    prix_acte INT,
    argent_recu_acte INT,
    argent_restant_acte INT,
    argent_assurance INT,
    logg_id TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: tab_assurance (assurances liées aux actes)
CREATE TABLE IF NOT EXISTS tab_assurance1763705999657 (
    id TEXT UNIQUE,
    nom VARCHAR(255),
    pourcentage INT,
    logg_id TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: tab_nom_acte (référentiel des noms d'actes)
CREATE TABLE IF NOT EXISTS tab_nom_acte1763705999657 (
    id TEXT UNIQUE,
    nom VARCHAR(255) UNIQUE,
    prix INT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    logg_id TEXT
);

-- Table: tab_nom_assurance (référentiel des noms d'assurances)
CREATE TABLE IF NOT EXISTS tab_nom_assurance1763705999657 (
    id TEXT UNIQUE,
    nom VARCHAR(255) UNIQUE,
    pourcentage INT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    logg_id TEXT
);

-- Table: tab_photo (photos)
CREATE TABLE IF NOT EXISTS tab_photo1763705999657 (
    id TEXT UNIQUE,
    logg_id TEXT,
    part1 TEXT,
    part2 TEXT,
    part3 TEXT,
    part4 TEXT,
    part5 TEXT,
    part6 TEXT,
    part7 TEXT,
    part8 TEXT,
    part9 TEXT,
    part10 TEXT
);

-- Table: tab_radio (radios/images médicales)
CREATE TABLE IF NOT EXISTS tab_radio1763705999657 (
    id TEXT UNIQUE,
    docteur_id TEXT,
    patient_id TEXT,
    acte_id TEXT,
    logg_id TEXT,
    file_path VARCHAR(255),
    thumbnail_path VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: tab_qr_code (codes QR)
CREATE TABLE IF NOT EXISTS tab_qr_code1763705999657 (
    id TEXT UNIQUE,
    logg_id TEXT,
    part1 TEXT,
    part2 TEXT,
    part3 TEXT,
    part4 TEXT,
    part5 TEXT,
    part6 TEXT,
    part7 TEXT,
    part8 TEXT,
    part9 TEXT,
    part10 TEXT
);

-- Table: tab_cabinet (cabinets médicaux)
CREATE TABLE IF NOT EXISTS tab_cabinet1763705999657 (
    id TEXT UNIQUE,
    nom VARCHAR(255),
    adresse VARCHAR(255),
    pays VARCHAR(255),
    logg_id TEXT
);

-- Table: tab_admin (administrateurs)
CREATE TABLE IF NOT EXISTS tab_admin1763705999657 (
    id TEXT UNIQUE,
    cabinet_id TEXT,
    url_pdf VARCHAR(255),
    logg_id TEXT
);

-- Table: tab_privilege (privilèges)
CREATE TABLE IF NOT EXISTS tab_privilege1763705999657 (
    id TEXT UNIQUE,
    nom TEXT,
    logg_id TEXT
);

-- Table: tab_modele_etat (modèles de documents Page État - JSON)
CREATE TABLE IF NOT EXISTS tab_modele_etat1763705999657 (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(10) DEFAULT '📄',
    description TEXT,
    category VARCHAR(50) DEFAULT 'administratif',
    elements_json LONGTEXT NOT NULL,
    logg_id TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: tab_connection (connexions)
CREATE TABLE IF NOT EXISTS tab_connection (
    id TEXT UNIQUE,
    logg_id TEXT,
    telephone VARCHAR(20) UNIQUE,
    login VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    role VARCHAR(50)
);

-- Table: tab_trace (traces d'actions)
CREATE TABLE IF NOT EXISTS tab_trace1763705999657 (
    id TEXT UNIQUE,
    action VARCHAR(50),
    type_entite VARCHAR(50),
    nom_entite VARCHAR(255),
    id_entite TEXT,
    date_action DATETIME,
    user_id TEXT,
    user_nom VARCHAR(255),
    user_role VARCHAR(50),
    details TEXT,
    logg_id TEXT
);

-- ===================================================================
-- PARTIE 3: PROCÉDURES DE GÉNÉRATION DE DONNÉES (10 LIGNES PAR TABLE)
-- Toutes les données sont liées au même docteur de référence
-- ===================================================================

-- Variables globales (sans docteur)
SET @CABINET_REF_ID = 'CABINET-REF-001';
SET @GENERIC_LOGG_ID = 'LOGG-GENERIC-001'; -- ID générique pour les relations

-- ===================================================================
-- Procédure: Génération des utilisateurs (10 patients)
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_users;

DELIMITER //
CREATE PROCEDURE generate_users()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE user_id TEXT;
    DECLARE user_logg_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_user', @TABID);
    
    -- Vider la table avec requête dynamique
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- Créer 10 patients avec des IDs numériques (timestamps)
    SET i = 0;
    WHILE i < 10 DO
        -- Générer un ID numérique basé sur un timestamp (comme dans le backend)
        -- Utiliser un timestamp de base + i pour garantir l'unicité
        SET @base_timestamp = UNIX_TIMESTAMP(NOW()) * 1000;
        SET user_id = CAST(@base_timestamp + i AS CHAR);
        -- Utiliser le même ID que user_id pour logg_id (pour la cohérence avec les actes)
        SET user_logg_id = user_id;
        
        -- Tous les utilisateurs sont des patients
        SET @user_role = 'patient';
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, nom, prenom, login, password, telephone, naissance, role, date_creation, adresse, logg_id) ',
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?) ',
            'ON DUPLICATE KEY UPDATE nom = VALUES(nom), prenom = VALUES(prenom), login = VALUES(login), ',
            'password = VALUES(password), telephone = VALUES(telephone), naissance = VALUES(naissance), ',
            'role = VALUES(role), adresse = VALUES(adresse), logg_id = VALUES(logg_id)');
        SET @user_id = user_id;
        SET @user_nom = CONCAT('Nom', i);
        SET @user_prenom = CONCAT('Prenom', i);
        SET @user_login = CONCAT('user', i, '@example.com');
        SET @user_password = '$2a$10$ILE6ShURm.iRBssegpQIDuo0XJUqSg7rwfu4WLXRaFNmbK.ifwLaW'; -- mot de passe: "1234" (hashé avec bcrypt)
        SET @user_telephone = CONCAT('06', LPAD(i, 8, '0'));
        SET @user_naissance = random_date();
        SET @user_adresse = CONCAT('Adresse ', i);
        SET @user_logg_id = user_logg_id;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @user_id, @user_nom, @user_prenom, @user_login, @user_password, 
            @user_telephone, @user_naissance, @user_role, @user_adresse, @user_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des patients
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_patients;

DELIMITER //
CREATE PROCEDURE generate_patients()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE patient_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_patient', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        -- Réinitialiser la variable pour éviter les valeurs obsolètes
        SET @found_id = NULL;
        
        -- Récupérer l'ID du patient depuis tab_user (ordre OFFSET)
        SET @sql = CONCAT('SELECT id INTO @found_id FROM tab_user', @TABID, 
            ' WHERE role = ''patient'' ORDER BY id LIMIT 1 OFFSET ', i);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        -- Si l'ID existe dans tab_user, créer l'entrée dans tab_patient avec le même ID
        IF @found_id IS NOT NULL THEN
            SET patient_id = @found_id;
            SET @sql = CONCAT('INSERT INTO ', table_name, 
                ' (id, nom_de_jeune_fille, profession, adresserPar, observation, date_creation, avoir_annuelle) ',
                'VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?) ',
                'ON DUPLICATE KEY UPDATE nom_de_jeune_fille = VALUES(nom_de_jeune_fille), ',
                'profession = VALUES(profession), adresserPar = VALUES(adresserPar), ',
                'observation = VALUES(observation), avoir_annuelle = VALUES(avoir_annuelle)');
            SET @patient_id = patient_id;
            SET @nom_jf = CONCAT('NomJF', i);
            SET @profession = CONCAT('Profession', i);
            SET @adresser_par = CONCAT('Dr. Dupont Jean');
            SET @observation = CONCAT('Observation patient ', i);
            SET @avoir = CAST(FLOOR(RAND() * 100000) AS CHAR);
            
            PREPARE stmt FROM @sql;
            EXECUTE stmt USING @patient_id, @nom_jf, @profession, @adresser_par, @observation, @avoir;
            DEALLOCATE PREPARE stmt;
        END IF;

        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des secrétaires
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_secretaires;

DELIMITER //
CREATE PROCEDURE generate_secretaires()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE secretaire_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_secretaire', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET secretaire_id = CONCAT('SECRETAIRE-', i);
        
        -- Utiliser les utilisateurs avec role 'secretaire' si disponibles
        SET @sql = CONCAT('SELECT id INTO @found_id FROM tab_user', @TABID, 
            ' WHERE role = ''secretaire'' LIMIT 1 OFFSET ', i);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        IF @found_id IS NOT NULL THEN
            SET secretaire_id = @found_id;
        END IF;
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, dateCreation, logg_id) VALUES (?, CURRENT_TIMESTAMP, ?) ',
            'ON DUPLICATE KEY UPDATE logg_id = ?');
        SET @secretaire_id = secretaire_id;
        SET @secretaire_logg_id = @GENERIC_LOGG_ID;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @secretaire_id, @secretaire_logg_id, @secretaire_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des comptables
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_comptables;

DELIMITER //
CREATE PROCEDURE generate_comptables()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE comptable_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_comptable', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET comptable_id = CONCAT('COMPTABLE-', i);
        
        -- Utiliser les utilisateurs avec role 'comptable' si disponibles
        SET @sql = CONCAT('SELECT id INTO @found_id FROM tab_user', @TABID, 
            ' WHERE role = ''comptable'' LIMIT 1 OFFSET ', i);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        IF @found_id IS NOT NULL THEN
            SET comptable_id = @found_id;
        END IF;
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, logg_id) VALUES (?, ?) ',
            'ON DUPLICATE KEY UPDATE logg_id = ?');
        SET @comptable_id = comptable_id;
        SET @comptable_logg_id = @GENERIC_LOGG_ID;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @comptable_id, @comptable_logg_id, @comptable_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des assistants
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_assistants;

DELIMITER //
CREATE PROCEDURE generate_assistants()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE assistant_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_assistant', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET assistant_id = CONCAT('ASSISTANT-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, ' (id) VALUES (?) ',
            'ON DUPLICATE KEY UPDATE id = ?');
        SET @assistant_id = assistant_id;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @assistant_id, @assistant_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des actes (liés aux patients)
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_actes;

DELIMITER //
CREATE PROCEDURE generate_actes()
BEGIN
    DECLARE patient_index INT DEFAULT 0;
    DECLARE acte_index INT DEFAULT 0;
    DECLARE acte_counter INT DEFAULT 0;
    DECLARE acte_id TEXT;
    DECLARE patient_id TEXT;
    DECLARE patient_logg_id TEXT;
    DECLARE acte_prix INT;
    DECLARE acte_argent_recu INT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_acte', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- Pour chaque patient, créer 20 actes
    SET patient_index = 0;
    WHILE patient_index < 10 DO
        -- Réinitialiser les variables pour éviter les valeurs obsolètes
        SET @found_patient_id = NULL;
        SET @found_patient_logg_id = NULL;
        SET patient_id = NULL;
        SET patient_logg_id = NULL;
        
        -- Récupérer l'ID et le logg_id du patient
        SET @sql = CONCAT('SELECT id, logg_id INTO @found_patient_id, @found_patient_logg_id FROM tab_user', @TABID, 
            ' WHERE role = ''patient'' LIMIT 1 OFFSET ', patient_index);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        IF @found_patient_id IS NOT NULL AND @found_patient_logg_id IS NOT NULL THEN
            SET patient_id = CAST(@found_patient_id AS CHAR);
            SET patient_logg_id = CAST(@found_patient_logg_id AS CHAR);
            
            -- Créer 20 actes pour ce patient
            SET acte_index = 0;
            WHILE acte_index < 20 DO
                -- Générer un ID numérique unique pour l'acte
                -- Utiliser un timestamp de base + un offset unique par patient et acte
                -- Format: timestamp_base + (patient_index * 10000) + acte_index
                -- Cela garantit l'unicité même si plusieurs patients sont créés rapidement
                SET @base_time = UNIX_TIMESTAMP(NOW()) * 1000;
                SET @acte_timestamp = @base_time + (patient_index * 10000) + acte_index;
                SET acte_id = CAST(@acte_timestamp AS CHAR);
                SET acte_prix = FLOOR(RAND() * 100000) + 10000;
                SET acte_argent_recu = FLOOR(acte_prix * (0.3 + RAND() * 0.7));
                
                SET @sql = CONCAT('INSERT INTO ', table_name, 
                    ' (id, nom, description, date, prix, argentRecu, argentRestant, logg_id, date_creation) ',
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ',
                    'ON DUPLICATE KEY UPDATE nom = VALUES(nom), description = VALUES(description), date = VALUES(date), ',
                    'prix = VALUES(prix), argentRecu = VALUES(argentRecu), argentRestant = VALUES(argentRestant), ',
                    'logg_id = VALUES(logg_id)');
                SET @acte_id = acte_id;
                SET @acte_nom = CONCAT('Acte médical ', acte_index + 1, ' - Patient ', patient_index);
                SET @acte_description = CONCAT('Description de l\'acte ', acte_index + 1, ' pour le patient ', patient_index);
                SET @acte_date = DATE_SUB(CURRENT_DATE, INTERVAL FLOOR(RAND() * 365) DAY);
                SET @acte_prix = acte_prix;
                SET @acte_argent_recu = acte_argent_recu;
                SET @acte_argent_restant = acte_prix - acte_argent_recu;
                -- S'assurer que le logg_id est bien une chaîne de caractères
                SET @acte_logg_id = CAST(patient_logg_id AS CHAR);
                
                PREPARE stmt FROM @sql;
                EXECUTE stmt USING @acte_id, @acte_nom, @acte_description, @acte_date, 
                    @acte_prix, @acte_argent_recu, @acte_argent_restant, @acte_logg_id;
                DEALLOCATE PREPARE stmt;
                
                SET acte_index = acte_index + 1;
                SET acte_counter = acte_counter + 1;
            END WHILE;
            
            -- Vérification : afficher le nombre d'actes créés pour ce patient
            SET @sql = CONCAT('SELECT COUNT(*) INTO @acte_count FROM tab_acte', @TABID, ' WHERE logg_id = ''', patient_logg_id, '''');
            PREPARE stmt FROM @sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
            
            -- Afficher un message pour chaque patient
            SELECT CONCAT('Patient ', patient_index, ' (ID: ', patient_id, ', logg_id: ', patient_logg_id, ') : ', @acte_count, ' actes créés') AS patient_info;
        END IF;
        
        SET patient_index = patient_index + 1;
    END WHILE;
    
    -- Afficher le nombre total d'actes créés
    SET @sql = CONCAT('SELECT COUNT(*) INTO @total_actes FROM tab_acte', @TABID);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    SELECT CONCAT('✅ ', @total_actes, ' actes créés au total') AS message;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des factures (liées aux actes)
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_factures;

DELIMITER //
CREATE PROCEDURE generate_factures()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE facture_id TEXT;
    DECLARE acte_id TEXT;
    DECLARE acte_logg_id TEXT;
    DECLARE facture_prix INT;
    DECLARE facture_argent_recu INT;
    DECLARE facture_argent_assurance INT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_facture', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- Créer une facture pour chaque acte (200 actes = 200 factures)
    WHILE i < 200 DO
        -- Récupérer l'ID et le logg_id d'un acte existant
        SET @sql = CONCAT('SELECT id, logg_id INTO @found_acte_id, @found_acte_logg_id FROM tab_acte', @TABID, 
            ' LIMIT 1 OFFSET ', i);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        IF @found_acte_id IS NOT NULL AND @found_acte_logg_id IS NOT NULL THEN
            SET acte_id = @found_acte_id;
            SET acte_logg_id = @found_acte_logg_id;
            SET facture_id = acte_id; -- Utiliser le même ID que l'acte
            
            -- Récupérer le prix de l'acte pour la facture
            SET @sql = CONCAT('SELECT prix INTO @found_acte_prix FROM tab_acte', @TABID, 
                ' WHERE id = ''', acte_id, '''');
            PREPARE stmt FROM @sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
            
            IF @found_acte_prix IS NOT NULL THEN
                SET facture_prix = @found_acte_prix;
            ELSE
                SET facture_prix = FLOOR(RAND() * 100000) + 10000;
            END IF;
            
            SET facture_argent_recu = FLOOR(facture_prix * (0.3 + RAND() * 0.7));
            SET facture_argent_assurance = FLOOR(facture_prix * RAND() * 0.3);
            
            SET @sql = CONCAT('INSERT INTO ', table_name, 
                ' (id, prix_acte, argent_recu_acte, argent_restant_acte, argent_assurance, logg_id, date_creation) ',
                'VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ',
                'ON DUPLICATE KEY UPDATE prix_acte = VALUES(prix_acte), argent_recu_acte = VALUES(argent_recu_acte), ',
                'argent_restant_acte = VALUES(argent_restant_acte), argent_assurance = VALUES(argent_assurance), ',
                'logg_id = VALUES(logg_id)');
            SET @facture_id = facture_id;
            SET @facture_prix = facture_prix;
            SET @facture_argent_recu = facture_argent_recu;
            SET @facture_argent_restant = facture_prix - facture_argent_recu - facture_argent_assurance;
            SET @facture_argent_assurance = facture_argent_assurance;
            SET @facture_logg_id = acte_logg_id;
            
            PREPARE stmt FROM @sql;
            EXECUTE stmt USING @facture_id, @facture_prix, @facture_argent_recu, 
                @facture_argent_restant, @facture_argent_assurance, @facture_logg_id;
            DEALLOCATE PREPARE stmt;
        END IF;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des assurances (liées aux actes)
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_assurances;

DELIMITER //
CREATE PROCEDURE generate_assurances()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE assurance_id TEXT;
    DECLARE acte_id TEXT;
    DECLARE acte_logg_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_assurance', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- Créer une assurance pour chaque acte (200 actes = 200 assurances)
    WHILE i < 200 DO
        -- Récupérer l'ID et le logg_id d'un acte existant
        SET @sql = CONCAT('SELECT id, logg_id INTO @found_acte_id, @found_acte_logg_id FROM tab_acte', @TABID, 
            ' LIMIT 1 OFFSET ', i);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        IF @found_acte_id IS NOT NULL AND @found_acte_logg_id IS NOT NULL THEN
            SET acte_id = @found_acte_id;
            SET acte_logg_id = @found_acte_logg_id;
            SET assurance_id = acte_id; -- Utiliser le même ID que l'acte
            
            -- Récupérer un nom d'assurance aléatoire depuis tab_nom_assurance (ou "non-assuré")
            SET @sql = CONCAT('SELECT COUNT(*) INTO @nom_assurance_count FROM tab_nom_assurance', @TABID);
            PREPARE stmt FROM @sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
            
            IF @nom_assurance_count > 0 THEN
                -- Utiliser un nom d'assurance existant aléatoirement
                SET @sql = CONCAT('SELECT nom, pourcentage INTO @found_nom_assurance, @found_pourcentage_assurance FROM tab_nom_assurance', @TABID, 
                    ' LIMIT 1 OFFSET ', FLOOR(RAND() * @nom_assurance_count));
                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
                
                IF @found_nom_assurance IS NOT NULL THEN
                    SET @assurance_nom = @found_nom_assurance;
                    SET @assurance_pourcentage = COALESCE(@found_pourcentage_assurance, FLOOR(RAND() * 100));
                ELSE
                    SET @assurance_nom = 'non-assuré';
                    SET @assurance_pourcentage = 0;
                END IF;
            ELSE
                -- Aucune assurance dans le référentiel, utiliser "non-assuré"
                SET @assurance_nom = 'non-assuré';
                SET @assurance_pourcentage = 0;
            END IF;
            
            SET @sql = CONCAT('INSERT INTO ', table_name, 
                ' (id, nom, pourcentage, logg_id, date_creation) ',
                'VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ',
                'ON DUPLICATE KEY UPDATE nom = VALUES(nom), pourcentage = VALUES(pourcentage), logg_id = VALUES(logg_id)');
            SET @assurance_id = assurance_id;
            SET @assurance_logg_id = acte_logg_id;
            
            PREPARE stmt FROM @sql;
            EXECUTE stmt USING @assurance_id, @assurance_nom, @assurance_pourcentage, @assurance_logg_id;
            DEALLOCATE PREPARE stmt;
        END IF;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des noms d'actes (référentiel)
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_nom_actes;

DELIMITER //
CREATE PROCEDURE generate_nom_actes()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE nom_acte_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_nom_acte', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET nom_acte_id = CONCAT('NOM-ACTE-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, nom, prix, date_creation, logg_id) ',
            'VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?) ',
            'ON DUPLICATE KEY UPDATE logg_id = ?');
        SET @nom_acte_id = nom_acte_id;
        SET @nom_acte_nom = CONCAT('Nom Acte ', i);
        SET @nom_acte_prix = FLOOR(RAND() * 100000) + 5000;
        SET @nom_acte_logg_id = @GENERIC_LOGG_ID;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @nom_acte_id, @nom_acte_nom, @nom_acte_prix, @nom_acte_logg_id, @nom_acte_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des noms d'assurances (référentiel)
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_nom_assurances;

DELIMITER //
CREATE PROCEDURE generate_nom_assurances()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE nom_assurance_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_nom_assurance', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET nom_assurance_id = CONCAT('NOM-ASSURANCE-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, nom, pourcentage, date_creation, logg_id) ',
            'VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?) ',
            'ON DUPLICATE KEY UPDATE logg_id = ?');
        SET @nom_assurance_id = nom_assurance_id;
        SET @nom_assurance_nom = CONCAT('Nom Assurance ', i);
        SET @nom_assurance_pourcentage = FLOOR(RAND() * 100);
        SET @nom_assurance_logg_id = @GENERIC_LOGG_ID;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @nom_assurance_id, @nom_assurance_nom, @nom_assurance_pourcentage, 
            @nom_assurance_logg_id, @nom_assurance_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des photos
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_photos;

DELIMITER //
CREATE PROCEDURE generate_photos()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE photo_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_photo', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET photo_id = CONCAT('PHOTO-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, logg_id, part1, part2, part3, part4, part5, part6, part7, part8, part9, part10) ',
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        SET @photo_id = photo_id;
        SET @photo_logg_id = @GENERIC_LOGG_ID;
        SET @photo_part1 = CONCAT('part1-', i);
        SET @photo_part2 = CONCAT('part2-', i);
        SET @photo_part3 = CONCAT('part3-', i);
        SET @photo_part4 = CONCAT('part4-', i);
        SET @photo_part5 = CONCAT('part5-', i);
        SET @photo_part6 = CONCAT('part6-', i);
        SET @photo_part7 = CONCAT('part7-', i);
        SET @photo_part8 = CONCAT('part8-', i);
        SET @photo_part9 = CONCAT('part9-', i);
        SET @photo_part10 = CONCAT('part10-', i);
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @photo_id, @photo_logg_id, @photo_part1, @photo_part2, @photo_part3, 
            @photo_part4, @photo_part5, @photo_part6, @photo_part7, @photo_part8, @photo_part9, @photo_part10;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des radios
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_radios;

DELIMITER //
CREATE PROCEDURE generate_radios()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE radio_id TEXT;
    DECLARE patient_id_ref TEXT;
    DECLARE acte_id_ref TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_radio', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- Récupérer un patient et un acte de référence
    SET @sql = CONCAT('SELECT id INTO @found_patient_id FROM tab_user', @TABID, 
        ' WHERE role = ''patient'' LIMIT 1');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    SET @sql = CONCAT('SELECT id INTO @found_acte_id FROM tab_acte', @TABID, ' LIMIT 1');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    IF @found_patient_id IS NULL THEN
        SET patient_id_ref = 'PATIENT-0';
    ELSE
        SET patient_id_ref = @found_patient_id;
    END IF;
    
    IF @found_acte_id IS NULL THEN
        SET acte_id_ref = 'ACTE-0';
    ELSE
        SET acte_id_ref = @found_acte_id;
    END IF;
    
    WHILE i < 10 DO
        SET radio_id = CONCAT('RADIO-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, docteur_id, patient_id, acte_id, logg_id, file_path, thumbnail_path, status, metadata, created_at, updated_at) ',
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
        SET @radio_id = radio_id;
        SET @radio_docteur_id = NULL; -- Pas de docteur
        SET @radio_patient_id = patient_id_ref;
        SET @radio_acte_id = acte_id_ref;
        SET @radio_logg_id = @GENERIC_LOGG_ID;
        SET @radio_file_path = CONCAT('/path/to/radio', i, '.jpg');
        SET @radio_thumbnail_path = CONCAT('/path/to/thumb', i, '.jpg');
        SET @radio_status = 'pending';
        SET @radio_metadata = CONCAT('{"metadata": "radio ', i, '"}');
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @radio_id, @radio_docteur_id, @radio_patient_id, @radio_acte_id, 
            @radio_logg_id, @radio_file_path, @radio_thumbnail_path, @radio_status, @radio_metadata;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des QR codes
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_qr_codes;

DELIMITER //
CREATE PROCEDURE generate_qr_codes()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE qr_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_qr_code', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET qr_id = CONCAT('QR-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, logg_id, part1, part2, part3, part4, part5, part6, part7, part8, part9, part10) ',
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        SET @qr_id = qr_id;
        SET @qr_logg_id = @GENERIC_LOGG_ID;
        SET @qr_part1 = CONCAT('qr-part1-', i);
        SET @qr_part2 = CONCAT('qr-part2-', i);
        SET @qr_part3 = CONCAT('qr-part3-', i);
        SET @qr_part4 = CONCAT('qr-part4-', i);
        SET @qr_part5 = CONCAT('qr-part5-', i);
        SET @qr_part6 = CONCAT('qr-part6-', i);
        SET @qr_part7 = CONCAT('qr-part7-', i);
        SET @qr_part8 = CONCAT('qr-part8-', i);
        SET @qr_part9 = CONCAT('qr-part9-', i);
        SET @qr_part10 = CONCAT('qr-part10-', i);
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @qr_id, @qr_logg_id, @qr_part1, @qr_part2, @qr_part3, 
            @qr_part4, @qr_part5, @qr_part6, @qr_part7, @qr_part8, @qr_part9, @qr_part10;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des cabinets
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_cabinets;

DELIMITER //
CREATE PROCEDURE generate_cabinets()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE cabinet_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_cabinet', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- Insérer le cabinet de référence
    SET @sql = CONCAT('INSERT INTO ', table_name, 
        ' (id, nom, adresse, pays, logg_id) VALUES (?, ?, ?, ?, ?)');
    SET @cabinet_id = @CABINET_REF_ID;
    SET @cabinet_nom = 'Cabinet Médical Principal';
    SET @cabinet_adresse = '123 Rue de la Santé';
    SET @cabinet_pays = 'France';
    SET @cabinet_logg_id = @GENERIC_LOGG_ID;
    
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING @cabinet_id, @cabinet_nom, @cabinet_adresse, @cabinet_pays, @cabinet_logg_id;
    DEALLOCATE PREPARE stmt;
    
    -- Générer 9 autres cabinets
    SET i = 1;
    WHILE i < 10 DO
        SET cabinet_id = CONCAT('CABINET-', i);
        
        SET @cabinet_id = cabinet_id;
        SET @cabinet_nom = CONCAT('Cabinet ', i);
        SET @cabinet_adresse = CONCAT('Adresse Cabinet ', i);
        SET @cabinet_pays = 'France';
        SET @cabinet_logg_id = @GENERIC_LOGG_ID;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @cabinet_id, @cabinet_nom, @cabinet_adresse, @cabinet_pays, @cabinet_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des admins
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_admins;

DELIMITER //
CREATE PROCEDURE generate_admins()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE admin_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_admin', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET admin_id = CONCAT('ADMIN-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, cabinet_id, url_pdf, logg_id) VALUES (?, ?, ?, ?)');
        SET @admin_id = admin_id;
        SET @admin_cabinet_id = @CABINET_REF_ID;
        SET @admin_url_pdf = CONCAT('/pdf/admin', i, '.pdf');
        SET @admin_logg_id = @GENERIC_LOGG_ID;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @admin_id, @admin_cabinet_id, @admin_url_pdf, @admin_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des privilèges
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_privileges;

DELIMITER //
CREATE PROCEDURE generate_privileges()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE privilege_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_privilege', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET privilege_id = CONCAT('PRIVILEGE-', i);
        
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, nom, logg_id) VALUES (?, ?, ?)');
        SET @privilege_id = privilege_id;
        SET @privilege_nom = CONCAT('selfInfo,crudPatient,crudActe,privilege', i);
        SET @privilege_logg_id = @GENERIC_LOGG_ID;
        
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @privilege_id, @privilege_nom, @privilege_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- Procédure: Génération des traces
-- ===================================================================
DROP PROCEDURE IF EXISTS generate_traces;

DELIMITER //
CREATE PROCEDURE generate_traces()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE trace_id TEXT;
    DECLARE table_name TEXT;
    
    SET table_name = CONCAT('tab_trace', @TABID);
    
    -- Vider la table
    SET @sql = CONCAT('DELETE FROM ', table_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    WHILE i < 10 DO
        SET trace_id = CONCAT('TRACE-', i);
        
        SET @trace_id = trace_id;
        SET @trace_action = CASE WHEN i % 3 = 0 THEN 'create' WHEN i % 3 = 1 THEN 'update' ELSE 'delete' END;
        SET @trace_type_entite = CASE WHEN i % 2 = 0 THEN 'acte' ELSE 'patient' END;
        SET @trace_nom_entite = CONCAT('Entité ', i);
        SET @trace_id_entite = CONCAT('ENTITE-', i);
        
        -- Utiliser un patient comme utilisateur de référence pour les traces
        SET @sql_select = CONCAT('SELECT id, nom, logg_id INTO @found_trace_user_id, @found_trace_user_nom, @found_trace_user_logg_id FROM tab_user', @TABID, 
            ' WHERE role = ''patient'' LIMIT 1');
        PREPARE stmt FROM @sql_select;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        IF @found_trace_user_id IS NOT NULL THEN
            SET @trace_user_id = @found_trace_user_id;
            SET @trace_user_nom = COALESCE(@found_trace_user_nom, 'Patient');
            SET @trace_user_role = 'patient';
            SET @trace_logg_id = COALESCE(@found_trace_user_logg_id, @GENERIC_LOGG_ID);
        ELSE
            SET @trace_user_id = 'PATIENT-0';
            SET @trace_user_nom = 'Patient';
            SET @trace_user_role = 'patient';
            SET @trace_logg_id = @GENERIC_LOGG_ID;
        END IF;
        
        SET @trace_details = CONCAT('{"details": "trace ', i, '"}');
        
        -- Construire la requête INSERT après avoir récupéré les données utilisateur
        SET @sql = CONCAT('INSERT INTO ', table_name, 
            ' (id, action, type_entite, nom_entite, id_entite, date_action, user_id, user_nom, user_role, details, logg_id) ',
            'VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)');
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @trace_id, @trace_action, @trace_type_entite, @trace_nom_entite, 
            @trace_id_entite, @trace_user_id, @trace_user_nom, @trace_user_role, @trace_details, @trace_logg_id;
        DEALLOCATE PREPARE stmt;
        
        SET i = i + 1;
    END WHILE;
END;
//
DELIMITER ;

-- ===================================================================
-- PARTIE 4: PROCÉDURE GLOBALE DE GÉNÉRATION
-- ===================================================================

DROP PROCEDURE IF EXISTS generate_all_demo_data;

DELIMITER //
CREATE PROCEDURE generate_all_demo_data()
BEGIN
    -- Générer les données dans l'ordre correct (parents -> enfants)
    
    -- 1. Tables de base (utilisateurs, cabinet)
    CALL generate_users();
    CALL generate_cabinets();
    
    -- 2. Tables liées aux utilisateurs
    CALL generate_patients();
    CALL generate_secretaires();
    CALL generate_comptables();
    CALL generate_assistants();
    
    -- 3. Référentiels
    CALL generate_nom_actes();
    CALL generate_nom_assurances();
    
    -- 4. Tables métier (actes, factures, assurances)
    -- Note: 10 patients × 20 actes = 200 actes, 200 factures, 200 assurances
    CALL generate_actes();
    CALL generate_factures();
    CALL generate_assurances();
    
    -- 5. Tables de support (photos, radios, QR codes)
    CALL generate_photos();
    CALL generate_radios();
    CALL generate_qr_codes();
    
    -- 6. Tables administratives
    CALL generate_admins();
    CALL generate_privileges();
    CALL generate_traces();
    
    SELECT '✅ Génération de toutes les données de test terminée (10 patients avec 20 actes chacun = 200 actes au total)' AS message;
END;
//
DELIMITER ;

-- ===================================================================
-- PARTIE 5: EXÉCUTION
-- ===================================================================

-- Réinitialiser le délimiteur pour les commandes suivantes
DELIMITER ;

-- Exécuter la procédure globale pour générer toutes les données
-- Cette commande créera :
-- - 10 patients
-- - 200 actes (20 par patient)
-- - 200 factures (1 par acte)
-- - 200 assurances (1 par acte)
-- - 10 lignes dans les autres tables
CALL generate_all_demo_data();

-- ===================================================================
-- FIN DU FICHIER
-- ===================================================================
