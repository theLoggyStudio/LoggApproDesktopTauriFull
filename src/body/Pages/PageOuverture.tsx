import React, { useEffect } from "react";
import { SecurityConnection } from "../Modules/SecutityConnection.js";
import logo from "../../assets/logo.png";
import { themes, ActualthemeNumber, criptKey } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';
import { invoke } from "../../tauri-bridge.js";
import { encrypteRepositoryStructure } from "../helpers/helpers.js";

export default function PageOuverture() {

    const { themeNumber } = useTheme();
    const theme = themes[themeNumber] ?? themes[ActualthemeNumber];

    useEffect(() => {
        (async () => {
            try {
                const payload = encrypteRepositoryStructure({ pays: "sn", tabId: "main" }, criptKey);
                await invoke("ensure_default_demo_docteur", { payload });
            } catch {
                /* silencieux : pas bloquant pour l’ouverture */
            }
        })();
    }, []);

    return (

        <div  style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <center>
                <div className="row">
                    <center className=""><img src={logo} alt="icone LoggAppro" width="300px" height="300px" /></center>
                    <h2 className="fst-italic"  style={{color: theme.primary}}>LoggAppro</h2>
                </div>
                <div className="row">
                    <div className="row" style={{backgroundColor: theme.primary, color: theme.secondary}}>
                        <div className=" theBorderedDiv my-5 py-3" style={{ width: "100%" }}>
                            <SecurityConnection />
                        </div>
                    </div>
                </div>


            </center>
            
        </div>
    );
}
