import React from "react";
import { useReadOnlyMode } from "../hooks/useReadOnlyMode";

// interface Props {
//     onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;  // Type explicite pour onClick
//     visibility?: string;  // visibility est optionnelle et de type string
// }
export default function ButtonAjouter({onClick,visibility="block"}) {
    const isReadOnly = useReadOnlyMode();
    const finalVisibility = isReadOnly ? "none" : visibility;

    return(

        <div className="row mb-3"> 
            <center>
                <button
                    type="submit"
                    className="btn btn-primary bouton-style px-4 py-2"
                    onClick={onClick}
                    style={{ display: finalVisibility }}
                    disabled={isReadOnly}
                >
                    Ajouter
                </button>
            </center>
        </div>
    );
}