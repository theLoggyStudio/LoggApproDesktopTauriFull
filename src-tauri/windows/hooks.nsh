; Hooks NSIS pour LoggAppro - Règles pare-feu (accès web ports 7061, 7062)
; S'exécute après l'installation, avec droits admin si installMode=perMachine

!macro NSIS_HOOK_POSTINSTALL
  ; Ajout des règles pare-feu pour l'accès web
  DetailPrint "Ajout des règles pare-feu LoggAppro..."
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="LoggAppro Web 7061" dir=in action=allow protocol=TCP localport=7061'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="LoggAppro Web 7062" dir=in action=allow protocol=TCP localport=7062'
  DetailPrint "Règles pare-feu configurées."
!macroend
