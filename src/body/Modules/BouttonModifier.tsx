import React from "react";
import { useReadOnlyMode } from "../hooks/useReadOnlyMode";

interface ButtonModifierProps {
    onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
    visibility?: string;
}

export default function ButtonModifier(props: ButtonModifierProps) {
    const { onClick, visibility = "block" } = props;
    const isReadOnly = useReadOnlyMode();
    const finalVisibility = isReadOnly ? "none" : visibility;

    return (
        <div className="row mb-3">
            <center>
                <button type="button" className='btn bouton-style w-5 border-2 px-5 border-warning text-warning' onClick={onClick} style={{display:finalVisibility}} disabled={isReadOnly}>Modifier</button>
            </center>
        </div>
    );
}