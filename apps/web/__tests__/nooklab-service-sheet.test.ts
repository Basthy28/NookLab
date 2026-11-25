/*
 * NookLab — unit tests for Service Sheet bottom-up 1-page copy & A4 print packing.
 */
import { describe, expect, it } from "vitest";
import {
  cleanHtmlWithoutSpacing,
  DEFAULT_SERVICE_SHEET_SETTINGS,
  groupUnitsIntoServices,
  packBottomToFit,
  parseUnitsFromHtml,
  type ServiceSheetSettings
} from "../src/common/nooklab-service-sheet-core";

const SAMPLE_SERVICE_HTML = `
<p data-spacing="double">Older Client 910000001</p>
<p data-spacing="double">Rua Antiga n1</p>
<p data-spacing="double">Lisboa</p>
<p data-spacing="double">Ver MLR Antiga</p>
<p data-spacing="double">________________________________________</p>
<p data-spacing="double">Rogério  919419180 Deu 30€</p>
<p data-spacing="double">Rua de São Pedro CCI 7501</p>
<p data-spacing="double">Venda do Alcaide  Pinhal novo</p>
<p data-spacing="double">Quem vai do Pinhal Novo para a Palhota é a rua a seguir a fabrica dos eletrodos</p>
<p data-spacing="double">Máquina de lavar louça</p>
<p data-spacing="double">Pedir Resistencia</p>
<p data-spacing="double">________________________________________</p>
<p data-spacing="double">Sr Carlos</p>
<p data-spacing="double">Junta do Forno</p>
<p data-spacing="double">Botao para o forno</p>
<p data-spacing="double">________________________________________</p>
<p data-spacing="double"><br></p>
<p data-spacing="double"><span style="color: rgb(220, 38, 38)"><strong>Adriana Costa</strong></span> 960330389 Alexandra 915679116</p>
<p data-spacing="double">rua escola dos arraiados</p>
<p data-spacing="double">Valdera, pinhal novo</p>
<p data-spacing="double">Depois na rua tem uma entrada pela direita com o nome Coutinho. Segue a rua e vira à esquerda. É a única casa no fim</p>
<p data-spacing="double"><span style="background-color: #fef08a">Ver MLR</span></p>
<hr />
<p data-spacing="double">Luis Rebelo 916011299</p>
<p data-spacing="double">Rua das papoilas 530</p>
<p data-spacing="double">Montijo</p>
<p data-spacing="double">Ver Esquentador Fagor</p>
<p data-spacing="double">________________________________________</p>
<p data-spacing="double">925240665 4M</p>
<p data-spacing="double">Rua Soeiro Pereira Gomes, lote 24</p>
<p data-spacing="double">3 esquerdo,</p>
<p data-spacing="double">2870-149, Montijo</p>
<p data-spacing="double">Ver MLR</p>
<hr />
<p data-spacing="double">Manuel Gonçalves 932820450 / 932824055</p>
<p data-spacing="double">Rua São Gonçalo nº101</p>
<p data-spacing="double">Brejos de Azeitão</p>
<p data-spacing="double">Máquina AEG W1050 electronic</p>
<p data-spacing="double">levantei Módulo</p>
<hr />
<p data-spacing="double">Jorge 918204775</p>
<p data-spacing="double">Aceiro das bicicletas (Quinta do amor Perfeito)</p>
<p data-spacing="double">Palhota</p>
<p data-spacing="double">Ver MLR Levantei Cuba</p>
<p data-spacing="double">Preciso da cruzeta rolamentos e retentor e Amortecedores</p>
<p data-spacing="double">________________________________________</p>
<p data-spacing="double">912388899 5FT</p>
<p data-spacing="double">Rua Madame Bertrand Sanges n32,</p>
<p data-spacing="double">palmela</p>
<p data-spacing="double">Ver MLL Samsung erro AC</p>
<hr />
<p data-spacing="double">Teresa Guerra 962700872</p>
<p data-spacing="double">Rua de Brancanes Nº4</p>
<p data-spacing="double">Setúbal</p>
<p data-spacing="double">Ver MLL</p>
<hr />
<p data-spacing="double">Maria Conceição Moraes 919587167</p>
<p data-spacing="double">R Miguel Candido nº 13</p>
<p data-spacing="double">Cabanas</p>
<p data-spacing="double">Ver MLR</p>
<hr />
<p data-spacing="double">Sr Adelia 962852608</p>
<p data-spacing="double">Rua Nossa Senhora do cais n77 3-Esq</p>
<p data-spacing="double">Setúbal</p>
<p data-spacing="double">Placa não funciona</p>
`;

describe("nooklab-service-sheet", () => {
  it("strips blank spacer paragraphs, splits soft <br> lines, and preserves colors/highlights/bold", () => {
    const html = `
      <p data-spacing="double"><span style="color: rgb(220, 38, 38)"><strong>Cliente Teste</strong></span><br>Morada 1</p>
      <p data-spacing="double"><br></p>
      <p data-spacing="double"><span style="background-color: #fef08a">Ver MLL</span></p>
    `;
    const cleaned = cleanHtmlWithoutSpacing(html, DEFAULT_SERVICE_SHEET_SETTINGS);
    expect(cleaned.plainText).toBe("Cliente Teste\nMorada 1\nVer MLL");
    expect(cleaned.plainText).not.toContain("\n\n");
    expect(cleaned.wordHtml).toContain("color: rgb(220, 38, 38)");
    expect(cleaned.wordHtml).toContain("<strong>Cliente Teste</strong>");
    expect(cleaned.wordHtml).toContain("background-color: #fef08a");
    expect(cleaned.wordHtml).toContain("mso-margin-bottom-alt:0pt");
    expect(cleaned.wordHtml).not.toContain("data-spacing");
  });

  it("groups services cleanly across both <hr> and underscore rules", () => {
    const units = parseUnitsFromHtml(SAMPLE_SERVICE_HTML, DEFAULT_SERVICE_SHEET_SETTINGS);
    const groups = groupUnitsIntoServices(units);
    expect(groups.length).toBe(12);
    expect(groups[0].previewLabel).toContain("Older Client");
    expect(groups[1].previewLabel).toContain("Rogério");
    expect(groups[3].previewLabel).toContain("Adriana Costa");
    expect(groups[11].previewLabel).toContain("Sr Adelia");
  });

  it("fits Word A4 blank page conservatively through Sr Adelia with safety cushion so last lines stay on page 1", () => {
    const packed = packBottomToFit(
      SAMPLE_SERVICE_HTML,
      DEFAULT_SERVICE_SHEET_SETTINGS,
      "Folha de Serviços"
    );

    expect(packed.plainText).not.toContain("Older Client");
    expect(packed.plainText).not.toContain("Rogério");
    expect(packed.plainText).not.toContain("Sr Carlos");
    expect(packed.plainText).not.toContain("Adriana Costa");
    expect(packed.plainText).not.toContain("Luis Rebelo");
    expect(packed.firstLinePreview).toContain("925240665 4M");
    expect(packed.lastLinePreview).toContain("Placa não funciona");
    expect(packed.groupCount).toBe(7);
    expect(packed.wordHtml).toContain("font-size:11.5pt");
    expect(packed.wordHtml).toContain("line-height:1.08");
    expect(packed.wordHtml).toContain("<br />");
    expect(packed.wordHtml).toContain("________________________________________");
    expect(packed.wordHtml).toContain("<hr size=\"1\"");
    expect(packed.wordHtml).not.toContain("<!--StartFragment-->");
    expect(packed.wordHtml).not.toContain(">&nbsp;</p>");
    expect(packed.plainText.startsWith("____")).toBe(false);
  });

  it("packs tight page sizes proportionally and builds valid A4 print HTML", () => {
    const tightSettings: ServiceSheetSettings = {
      ...DEFAULT_SERVICE_SHEET_SETTINGS,
      mode: "lines",
      maxLines: 14,
      wholeBlocksOnly: true
    };
    const packed = packBottomToFit(SAMPLE_SERVICE_HTML, tightSettings, "Folha de Serviços");

    expect(packed.groupCount).toBe(3);
    expect(packed.firstLinePreview).toContain("Teresa Guerra");
    expect(packed.lastLinePreview).toContain("Placa não funciona");
    expect(packed.plainText).not.toContain("912388899 5FT");

    expect(packed.printHtml).toContain("@page");
    expect(packed.printHtml).toContain("size: A4 portrait");
    expect(packed.printHtml).toContain("margin: 0;");
    expect(packed.printHtml).toContain("margin: 6pt 0");
    expect(packed.printHtml).toContain("print-color-adjust: exact");
    expect(packed.printHtml).toContain("<hr style=");
    expect(packed.printHtml).toContain("<title>Folha de Serviços</title>");
  });
});
