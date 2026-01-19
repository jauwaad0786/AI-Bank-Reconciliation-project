# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


Show tree:
function Show-Tree {
     param (
         [string]$Path = ".",
         [string]$Prefix = ""
     )

     # Get children excluding node_modules
     $items = Get-ChildItem -Force -LiteralPath $Path | Where-Object { $_.Name -ne "node_modules" }

     for ($i = 0; $i -lt $items.Count; $i++) {
         $item = $items[$i]
         $isLast = ($i -eq $items.Count - 1)
         $connector = if ($isLast) { "└── " } else { "├── " }

         Write-Output "$Prefix$connector$($item.Name)"

         if ($item.PSIsContainer) {
             $newPrefix = if ($isLast) { "$Prefix    " } else { "$Prefix│   " }
             Show-Tree -Path $item.FullName -Prefix $newPrefix
         }
     }
 }