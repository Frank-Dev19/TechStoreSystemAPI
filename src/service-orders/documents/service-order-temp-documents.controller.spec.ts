import { NotFoundException } from '@nestjs/common';
import { ServiceOrderTempDocumentsController } from './service-order-temp-documents.controller';

describe('ServiceOrderTempDocumentsController', () => {
  const createResponse = () =>
    ({
      setHeader: jest.fn(),
      sendFile: jest.fn(),
    }) as any;

  it('serves the file for an active token', async () => {
    const tempDocumentsService = {
      resolveForDownload: jest.fn().mockResolvedValue({
        fileName: 'resumen-ordenes.pdf',
        mimeType: 'application/pdf',
        absolutePath: 'C:/tmp/resumen-ordenes.pdf',
      }),
    } as any;
    const controller = new ServiceOrderTempDocumentsController(tempDocumentsService);
    const response = createResponse();

    await controller.download('valid-token', response);

    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.sendFile).toHaveBeenCalledWith('C:/tmp/resumen-ordenes.pdf');
  });

  it('throws not found for expired or missing token', async () => {
    const tempDocumentsService = {
      resolveForDownload: jest.fn().mockRejectedValue(new NotFoundException()),
    } as any;
    const controller = new ServiceOrderTempDocumentsController(tempDocumentsService);
    const response = createResponse();

    await expect(controller.download('missing-token', response)).rejects.toBeInstanceOf(NotFoundException);
  });
});
