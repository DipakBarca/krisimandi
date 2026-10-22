import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { AuctionsService } from './auctions.service';
import { BidDto, CancelOrderDto, CounterOfferDto, CreateOfferDto, OffersQuery, PaymentDto, PickupDto, ReviewDto } from './dto';
import { OffersService } from './offers.service';
import { OrdersService } from './orders.service';

@Controller()
export class DealsController {
  constructor(
    private readonly offers: OffersService,
    private readonly auctions: AuctionsService,
    private readonly orders: OrdersService,
  ) {}

  // ----- Offers (fixed-price listings) -----

  @Roles('BUYER')
  @Post('listings/:id/offers')
  makeOffer(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateOfferDto) {
    return this.offers.create(user, id, dto);
  }

  @Get('listings/:id/offers')
  listingOffers(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.forListing(user, id);
  }

  @Get('me/offers')
  myOffers(@CurrentUser() user: User, @Query() q: OffersQuery) {
    return this.offers.mine(user, q.side);
  }

  @Post('offers/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.accept(user, id);
  }

  @Post('offers/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.reject(user, id);
  }

  @Post('offers/:id/counter')
  counter(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CounterOfferDto) {
    return this.offers.counter(user, id, dto);
  }

  @Post('offers/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.withdraw(user, id);
  }

  // ----- Auctions -----

  @Public()
  @Get('listings/:id/auction')
  auction(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: User) {
    return this.auctions.state(id, user);
  }

  @Roles('BUYER')
  @Post('listings/:id/bids')
  bid(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BidDto) {
    return this.auctions.bid(user, id, dto.amountPerUnit);
  }

  @Post('listings/:id/auction/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.auctions.confirm(user, id);
  }

  @Post('listings/:id/auction/pass')
  @HttpCode(200)
  pass(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.auctions.pass(user, id);
  }

  // ----- Orders (agreed deals) -----

  @Get('me/orders')
  myOrders(@CurrentUser() user: User) {
    return this.orders.list(user);
  }

  @Get('orders/:id')
  order(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(user, id);
  }

  @Patch('orders/:id')
  setPickup(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickupDto) {
    return this.orders.setPickup(user, id, dto);
  }

  @Post('orders/:id/ready')
  @HttpCode(200)
  ready(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickupDto) {
    return this.orders.ready(user, id, dto);
  }

  @Post('orders/:id/picked-up')
  @HttpCode(200)
  pickedUp(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.pickedUp(user, id);
  }

  @Post('orders/:id/paid')
  @HttpCode(200)
  paid(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto) {
    return this.orders.markPaid(user, id, dto.method);
  }

  @Post('orders/:id/payment-received')
  @HttpCode(200)
  paymentReceived(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto) {
    return this.orders.confirmPayment(user, id, dto.method);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancel(user, id, dto);
  }

  @Post('orders/:id/review')
  review(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.orders.review(user, id, dto);
  }

  @Public()
  @Get('users/:id/reviews')
  reviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.reviewsOf(id);
  }
}
