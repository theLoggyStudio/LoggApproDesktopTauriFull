import React from "react";
import "./css/pagesConnection.css";
import { SecurityConnection } from "../../Modules/SecutityConnection.js";
import logo from "../../../assets/logo.png";
import { themes } from "../../../constants/index.ts";
import { useTheme } from "../../context/ThemeContext.js";

export default function PageNouveauCompte() {
    const { themeNumber } = useTheme();
    return (
        <div className="vw-100" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="row flex-grow-1" style={{ flex: 1, alignItems: "center" }}>
                <div className="col-xl-6 d-flex justify-content-center align-items-center">
                    <center>
                        <img src={logo} alt="icone LoggAppro" width="300px" height="300px" />
                        <h2 className="fst-italic mt-2" style={{ color: themes[themeNumber].primary }}>
                            LoggAppro
                        </h2>
                    </center>
                </div>
                <div className="col-xl-6 color-violet d-flex flex-column justify-content-center align-items-center">
                    <div
                        className="theBorderedDiv py-3"
                        style={{
                            width: "100%",
                            backgroundColor: themes[themeNumber].primary,
                            color: themes[themeNumber].secondary,
                        }}
                    >
                        <SecurityConnection initialView="nouveauCompte" standalone />
                    </div>
                </div>
            </div>
        </div>
    );
}
